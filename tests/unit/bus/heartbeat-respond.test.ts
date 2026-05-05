import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { heartbeatRespond } from '../../../src/bus/heartbeat-respond';
import { readCronState } from '../../../src/bus/cron-state';
import type { BusPaths } from '../../../src/types/index.js';

let tmpDir: string;
let paths: BusPaths;

function buildPaths(root: string): BusPaths {
  const stateDir = join(root, 'state', 'agentX');
  const analyticsDir = join(root, 'orgs', 'orgX', 'analytics');
  return {
    ctxRoot: root,
    inbox: join(root, 'inbox', 'agentX'),
    inflight: join(root, 'inflight', 'agentX'),
    processed: join(root, 'processed', 'agentX'),
    logDir: join(root, 'logs', 'agentX'),
    stateDir,
    taskDir: join(root, 'orgs', 'orgX', 'tasks'),
    approvalDir: join(root, 'orgs', 'orgX', 'approvals'),
    analyticsDir,
    deliverablesDir: join(root, 'orgs', 'orgX', 'deliverables'),
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'heartbeat-respond-test-'));
  paths = buildPaths(tmpDir);
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('heartbeatRespond — happy path', () => {
  it('runs all four substeps and returns allOk=true', () => {
    const memoryDir = join(tmpDir, 'memory');
    const result = heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'ok',
      inboxCount: 2,
      tasksCount: 3,
      next: 'work on heartbeat_respond',
      note: 'all clear',
      memoryDir,
    });

    expect(result.allOk).toBe(true);
    expect(result.heartbeat.ok).toBe(true);
    expect(result.event.ok).toBe(true);
    expect(result.cronFire.ok).toBe(true);
    expect(result.memory.ok).toBe(true);
    expect(result.memory.path).toBeDefined();
  });

  it('writes heartbeat.json with status mapped from ok → online', () => {
    heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'ok',
      memoryDir: join(tmpDir, 'memory'),
    });
    const hb = JSON.parse(readFileSync(join(paths.stateDir, 'heartbeat.json'), 'utf-8'));
    expect(hb.status).toBe('online');
    expect(hb.agent).toBe('agentX');
  });

  it('writes heartbeat.json with status passed through for degraded/blocked', () => {
    heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'degraded',
      memoryDir: join(tmpDir, 'memory'),
    });
    const hb1 = JSON.parse(readFileSync(join(paths.stateDir, 'heartbeat.json'), 'utf-8'));
    expect(hb1.status).toBe('degraded');

    heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'blocked',
      memoryDir: join(tmpDir, 'memory'),
    });
    const hb2 = JSON.parse(readFileSync(join(paths.stateDir, 'heartbeat.json'), 'utf-8'));
    expect(hb2.status).toBe('blocked');
  });

  it('records cron fire under the configured name (default heartbeat)', () => {
    heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'ok',
      cronInterval: '8h',
      memoryDir: join(tmpDir, 'memory'),
    });
    const cron = readCronState(paths.stateDir);
    expect(cron.crons).toHaveLength(1);
    expect(cron.crons[0].name).toBe('heartbeat');
    expect(cron.crons[0].interval).toBe('8h');
  });

  it('respects a custom cron name', () => {
    heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'ok',
      cronName: 'mid-day-check',
      cronInterval: '12h',
      memoryDir: join(tmpDir, 'memory'),
    });
    const cron = readCronState(paths.stateDir);
    expect(cron.crons[0].name).toBe('mid-day-check');
  });

  it('writes a daily memory entry containing status and structured fields', () => {
    const memoryDir = join(tmpDir, 'memory');
    const result = heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'ok',
      inboxCount: 5,
      tasksCount: 1,
      next: 'review LinkedIn posts',
      note: 'orchestrator-assigned',
      task: 'task_123',
      memoryDir,
    });
    const today = new Date().toISOString().slice(0, 10);
    const expected = join(memoryDir, `${today}.md`);
    expect(result.memory.path).toBe(expected);
    const body = readFileSync(expected, 'utf-8');
    expect(body).toContain('## Heartbeat Update');
    expect(body).toContain('- Status: ok');
    expect(body).toContain('- Inbox: 5');
    expect(body).toContain('- Tasks: 1');
    expect(body).toContain('- Working on: task_123');
    expect(body).toContain('- Next action: review LinkedIn posts');
    expect(body).toContain('- Note: orchestrator-assigned');
  });

  it('appends rather than overwrites successive entries', () => {
    const memoryDir = join(tmpDir, 'memory');
    heartbeatRespond(paths, 'agentX', 'orgX', { status: 'ok', note: 'first', memoryDir });
    heartbeatRespond(paths, 'agentX', 'orgX', { status: 'ok', note: 'second', memoryDir });
    const today = new Date().toISOString().slice(0, 10);
    const body = readFileSync(join(memoryDir, `${today}.md`), 'utf-8');
    expect(body.match(/## Heartbeat Update/g)?.length).toBe(2);
    expect(body).toContain('first');
    expect(body).toContain('second');
  });

  it('skips memory write when skipMemory=true', () => {
    const memoryDir = join(tmpDir, 'memory');
    const result = heartbeatRespond(paths, 'agentX', 'orgX', {
      status: 'ok',
      memoryDir,
      skipMemory: true,
    });
    expect(result.memory.ok).toBe(true);
    expect(result.memory.skipped).toBe(true);
    expect(existsSync(memoryDir)).toBe(false);
  });
});

describe('heartbeatRespond — partial-failure surfacing', () => {
  it('reports memory failure but keeps allOk=false without aborting other steps', () => {
    // Force a memory write failure by pointing memoryDir at a path the process
    // cannot create. Works on POSIX by creating a read-only parent.
    if (process.platform === 'win32') return; // chmod semantics differ on Windows
    const blocked = join(tmpDir, 'blocked');
    mkdirSync(blocked, { recursive: true });
    chmodSync(blocked, 0o500); // read+execute only — mkdir of subdir will fail

    try {
      const result = heartbeatRespond(paths, 'agentX', 'orgX', {
        status: 'ok',
        memoryDir: join(blocked, 'memory'),
      });
      expect(result.heartbeat.ok).toBe(true);
      expect(result.event.ok).toBe(true);
      expect(result.cronFire.ok).toBe(true);
      expect(result.memory.ok).toBe(false);
      expect(result.memory.error).toBeDefined();
      expect(result.allOk).toBe(false);
    } finally {
      chmodSync(blocked, 0o700);
    }
  });
});
