import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTask, completeTask } from '../../../src/bus/task';
import { logEvent } from '../../../src/bus/event';
import { sendMessage } from '../../../src/bus/message';
import type { BusPaths } from '../../../src/types';

// C1: the identity guard MARKS (never blocks) a write whose author is not a
// registered agent of ours, so a foreign session dropping tasks/events/messages
// on our bus is visible. Same (CTX_ORG, name) resolution as the heartbeat guard.
// Three states per command: registered -> no tag; disabled and unregistered -> tag.
describe('identity guard on bus commands (C1: mark, not reject)', () => {
  let testDir: string;
  let paths: BusPaths;
  const savedOrg = process.env.CTX_ORG;
  const savedFR = process.env.CTX_FRAMEWORK_ROOT;

  function makeAgent(name: string, enabled: boolean) {
    const dir = join(testDir, 'framework', 'orgs', 'unikprompt', 'agents', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ enabled }));
  }
  function readTask(taskId: string) {
    return JSON.parse(readFileSync(join(paths.taskDir, `${taskId}.json`), 'utf-8'));
  }
  function readLastEvent(agent: string) {
    const dir = join(paths.analyticsDir, 'events', agent);
    const file = readdirSync(dir).find(f => f.endsWith('.jsonl'))!;
    const lines = readFileSync(join(dir, file), 'utf-8').trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  }
  function readMessageTo(to: string) {
    const dir = join(paths.ctxRoot, 'inbox', to);
    const file = readdirSync(dir).find(f => f.endsWith('.json'))!;
    return JSON.parse(readFileSync(join(dir, file), 'utf-8'));
  }

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'id-guard-'));
    paths = {
      ctxRoot: testDir,
      inbox: join(testDir, 'inbox', 'alice'),
      inflight: join(testDir, 'inflight', 'alice'),
      processed: join(testDir, 'processed', 'alice'),
      logDir: join(testDir, 'logs', 'alice'),
      stateDir: join(testDir, 'state', 'alice'),
      taskDir: join(testDir, 'tasks'),
      approvalDir: join(testDir, 'approvals'),
      analyticsDir: join(testDir, 'analytics'),
      heartbeatDir: join(testDir, 'heartbeats'),
    };
    process.env.CTX_FRAMEWORK_ROOT = join(testDir, 'framework');
    process.env.CTX_ORG = 'unikprompt';
    makeAgent('alice', true);   // registered
    makeAgent('bob', false);    // disabled
    // 'ghost' has no config anywhere -> unregistered
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    if (savedOrg === undefined) delete process.env.CTX_ORG; else process.env.CTX_ORG = savedOrg;
    if (savedFR === undefined) delete process.env.CTX_FRAMEWORK_ROOT; else process.env.CTX_FRAMEWORK_ROOT = savedFR;
  });

  describe('create-task', () => {
    it('registered creator: no identity tag', () => {
      const id = createTask(paths, 'alice', 'unikprompt', 'T');
      expect(readTask(id).identity).toBeUndefined();
    });
    it('disabled creator: identity=disabled', () => {
      const id = createTask(paths, 'bob', 'unikprompt', 'T');
      expect(readTask(id).identity).toBe('disabled');
    });
    it('unregistered creator: identity=unregistered (the VIP Limo case)', () => {
      const id = createTask(paths, 'ghost', 'unikprompt', 'T');
      expect(readTask(id).identity).toBe('unregistered');
    });
  });

  describe('complete-task', () => {
    it('registered completer: no identity tag', () => {
      const id = createTask(paths, 'alice', 'unikprompt', 'T');
      completeTask(paths, id, 'done', 'alice');
      expect(readTask(id).identity).toBeUndefined();
    });
    it('disabled completer: identity=disabled', () => {
      const id = createTask(paths, 'alice', 'unikprompt', 'T');
      completeTask(paths, id, 'done', 'bob');
      expect(readTask(id).identity).toBe('disabled');
    });
    it('unregistered completer: identity=unregistered', () => {
      const id = createTask(paths, 'alice', 'unikprompt', 'T');
      completeTask(paths, id, 'done', 'ghost');
      expect(readTask(id).identity).toBe('unregistered');
    });
    it('a foreign-CREATED task keeps its tag when a registered agent completes it', () => {
      const id = createTask(paths, 'ghost', 'unikprompt', 'T');
      expect(readTask(id).identity).toBe('unregistered');
      completeTask(paths, id, 'done', 'alice');
      expect(readTask(id).identity).toBe('unregistered'); // registered completer does not clear it
    });
    it('no completedBy passed: no tag added (backward-compatible call sites)', () => {
      const id = createTask(paths, 'alice', 'unikprompt', 'T');
      completeTask(paths, id, 'done'); // legacy 3-arg form
      expect(readTask(id).identity).toBeUndefined();
    });
  });

  describe('log-event', () => {
    it('registered writer: no identity tag', () => {
      logEvent(paths, 'alice', 'unikprompt', 'action', 'test', 'info', {});
      expect(readLastEvent('alice').identity).toBeUndefined();
    });
    it('disabled writer: identity=disabled', () => {
      logEvent(paths, 'bob', 'unikprompt', 'action', 'test', 'info', {});
      expect(readLastEvent('bob').identity).toBe('disabled');
    });
    it('unregistered writer: identity=unregistered', () => {
      logEvent(paths, 'ghost', 'unikprompt', 'action', 'test', 'info', {});
      expect(readLastEvent('ghost').identity).toBe('unregistered');
    });
  });

  describe('send-message', () => {
    it('registered sender: no identity tag', () => {
      sendMessage(paths, 'alice', 'target1', 'normal', 'hi');
      expect(readMessageTo('target1').identity).toBeUndefined();
    });
    it('disabled sender: identity=disabled', () => {
      sendMessage(paths, 'bob', 'target2', 'normal', 'hi');
      expect(readMessageTo('target2').identity).toBe('disabled');
    });
    it('unregistered sender: identity=unregistered', () => {
      sendMessage(paths, 'ghost', 'target3', 'normal', 'hi');
      expect(readMessageTo('target3').identity).toBe('unregistered');
    });
  });
});
