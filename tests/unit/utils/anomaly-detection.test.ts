import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  loadConfig,
  saveConfig,
  loadState,
  saveState,
  configPath,
  statePath,
  median,
  detectTokenSpike,
  detectHeartbeatStale,
  detectCompletionDrop,
  detectAll,
  DEFAULT_CONFIG,
  agentToProjectId,
  type AnomalyDetectionConfig,
  type HeartbeatRecord,
  type TaskRecord,
  type ProjectDailyMap,
} from '../../../src/utils/anomaly-detection';

let ctxRoot: string;

beforeEach(() => {
  ctxRoot = join(tmpdir(), `ad-${randomBytes(6).toString('hex')}`);
  mkdirSync(ctxRoot, { recursive: true });
});

afterEach(() => {
  rmSync(ctxRoot, { recursive: true, force: true });
});

const baseCfg: AnomalyDetectionConfig = {
  ...DEFAULT_CONFIG,
  notify_chat_id: '270021643',
};

describe('anomaly-detection config + state IO', () => {
  it('loadConfig returns null when missing', () => {
    expect(loadConfig(ctxRoot)).toBeNull();
  });

  it('save and reload config round-trips', () => {
    saveConfig(ctxRoot, { ...baseCfg, token_multiplier: 3.0, agents_filter: ['developer'] });
    const loaded = loadConfig(ctxRoot);
    expect(loaded?.token_multiplier).toBe(3.0);
    expect(loaded?.agents_filter).toEqual(['developer']);
    expect(loaded?.notify_chat_id).toBe('270021643');
    expect(existsSync(configPath(ctxRoot))).toBe(true);
  });

  it('loadState returns empty when missing', () => {
    const s = loadState(ctxRoot);
    expect(s.fired).toEqual({});
    expect(s.last_check_at).toBeNull();
  });

  it('save and reload state round-trips', () => {
    saveState(ctxRoot, {
      last_check_at: '2026-05-01T12:00:00Z',
      fired: { 'token_spike:developer': '2026-05-01T11:00:00Z' },
    });
    const s = loadState(ctxRoot);
    expect(s.fired['token_spike:developer']).toBe('2026-05-01T11:00:00Z');
    expect(existsSync(statePath(ctxRoot))).toBe(true);
  });

  it('handles malformed config + state files', () => {
    mkdirSync(join(ctxRoot, 'config'), { recursive: true });
    mkdirSync(join(ctxRoot, 'state'), { recursive: true });
    writeFileSync(configPath(ctxRoot), '{not-json');
    writeFileSync(statePath(ctxRoot), '{not-json');
    expect(loadConfig(ctxRoot)).toBeNull();
    expect(loadState(ctxRoot).fired).toEqual({});
  });
});

describe('median + agentToProjectId', () => {
  it('median on empty returns 0', () => {
    expect(median([])).toBe(0);
  });
  it('median of odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('median of even-length list averages middle two', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('agentToProjectId follows ccusage path convention', () => {
    const id = agentToProjectId('developer', 'unikprompt');
    expect(id).toMatch(/-cortextos-orgs-unikprompt-agents-developer$/);
  });
});

describe('detectTokenSpike', () => {
  const now = new Date('2026-05-01T12:00:00Z');
  const projId = agentToProjectId('developer', 'unikprompt');

  it('returns null when fewer than 4 daily entries', () => {
    const map: ProjectDailyMap = { [projId]: [
      { date: '2026-05-01', totalCost: 50, totalTokens: 1 },
      { date: '2026-04-30', totalCost: 5, totalTokens: 1 },
    ]};
    expect(detectTokenSpike('developer', 'unikprompt', baseCfg, map, now)).toBeNull();
  });

  it('fires when today exceeds multiplier × baseline median', () => {
    const map: ProjectDailyMap = { [projId]: [
      { date: '2026-05-01', totalCost: 25, totalTokens: 1 },   // today
      { date: '2026-04-30', totalCost: 8, totalTokens: 1 },
      { date: '2026-04-29', totalCost: 10, totalTokens: 1 },
      { date: '2026-04-28', totalCost: 9, totalTokens: 1 },
    ]};
    const a = detectTokenSpike('developer', 'unikprompt', baseCfg, map, now);
    expect(a).not.toBeNull();
    expect(a!.rule).toBe('token_spike');
    expect(a!.metric).toBe(25);
    expect(a!.baseline).toBe(9);
  });

  it('does not fire when today is within multiplier of baseline', () => {
    const map: ProjectDailyMap = { [projId]: [
      { date: '2026-05-01', totalCost: 12, totalTokens: 1 },
      { date: '2026-04-30', totalCost: 8, totalTokens: 1 },
      { date: '2026-04-29', totalCost: 10, totalTokens: 1 },
      { date: '2026-04-28', totalCost: 9, totalTokens: 1 },
    ]};
    expect(detectTokenSpike('developer', 'unikprompt', baseCfg, map, now)).toBeNull();
  });

  it('returns null when no entry for today', () => {
    const map: ProjectDailyMap = { [projId]: [
      { date: '2026-04-30', totalCost: 8, totalTokens: 1 },
      { date: '2026-04-29', totalCost: 10, totalTokens: 1 },
      { date: '2026-04-28', totalCost: 9, totalTokens: 1 },
      { date: '2026-04-27', totalCost: 7, totalTokens: 1 },
    ]};
    expect(detectTokenSpike('developer', 'unikprompt', baseCfg, map, now)).toBeNull();
  });
});

describe('detectHeartbeatStale', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('returns null for night-mode agents', () => {
    const hb: HeartbeatRecord = {
      agent: 'developer', org: 'unikprompt', status: 'online',
      mode: 'night', last_heartbeat: '2026-04-30T12:00:00Z',
    };
    expect(detectHeartbeatStale('developer', baseCfg, hb, now)).toBeNull();
  });

  it('fires when day-mode agent stale beyond threshold', () => {
    const hb: HeartbeatRecord = {
      agent: 'developer', org: 'unikprompt', status: 'online',
      mode: 'day',
      last_heartbeat: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
    };
    const a = detectHeartbeatStale('developer', baseCfg, hb, now);
    expect(a).not.toBeNull();
    expect(a!.rule).toBe('heartbeat_stale');
    expect(a!.severity).toBe('critical');
    expect(a!.metric).toBeGreaterThanOrEqual(4);
  });

  it('does not fire when day-mode agent within threshold', () => {
    const hb: HeartbeatRecord = {
      agent: 'developer', org: 'unikprompt', status: 'online',
      mode: 'day',
      last_heartbeat: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
    };
    expect(detectHeartbeatStale('developer', baseCfg, hb, now)).toBeNull();
  });

  it('returns null on missing heartbeat record', () => {
    expect(detectHeartbeatStale('developer', baseCfg, null, now)).toBeNull();
  });
});

describe('detectCompletionDrop', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  function mkTask(id: string, ageDays: number, completed: boolean): TaskRecord {
    const created = new Date(now.getTime() - ageDays * 24 * 3600 * 1000).toISOString();
    return {
      id,
      assigned_to: 'developer',
      status: completed ? 'completed' : 'in_progress',
      created_at: created,
      completed_at: completed ? created : null,
    };
  }

  it('returns null when too few tasks in either window', () => {
    const tasks: TaskRecord[] = [
      mkTask('a', 1, true),
      mkTask('b', 2, true),
      mkTask('c', 8, false),
    ];
    expect(detectCompletionDrop('developer', baseCfg, tasks, now)).toBeNull();
  });

  it('fires when recent rate dropped >= threshold pct vs baseline', () => {
    // baseline window (8-14d ago): 5 tasks all completed (100%)
    // recent window (0-7d ago): 5 tasks, 1 completed (20%) → drop = 80%
    const tasks: TaskRecord[] = [
      mkTask('a', 9, true), mkTask('b', 10, true), mkTask('c', 11, true),
      mkTask('d', 12, true), mkTask('e', 13, true),
      mkTask('f', 1, true), mkTask('g', 2, false), mkTask('h', 3, false),
      mkTask('i', 4, false), mkTask('j', 5, false),
    ];
    const a = detectCompletionDrop('developer', baseCfg, tasks, now);
    expect(a).not.toBeNull();
    expect(a!.rule).toBe('completion_drop');
    expect(a!.details.drop_pct as number).toBeGreaterThanOrEqual(50);
  });

  it('does not fire when drop below threshold', () => {
    // baseline: 5/5 = 100%, recent: 4/5 = 80% → drop = 20% (< 50% threshold)
    const tasks: TaskRecord[] = [
      mkTask('a', 9, true), mkTask('b', 10, true), mkTask('c', 11, true),
      mkTask('d', 12, true), mkTask('e', 13, true),
      mkTask('f', 1, true), mkTask('g', 2, true), mkTask('h', 3, true),
      mkTask('i', 4, true), mkTask('j', 5, false),
    ];
    expect(detectCompletionDrop('developer', baseCfg, tasks, now)).toBeNull();
  });
});

describe('detectAll integration', () => {
  it('runs all rules, applies dedup, persists state, resets after dedup window', () => {
    saveConfig(ctxRoot, baseCfg);
    const now = new Date('2026-05-01T12:00:00Z');
    const projId = agentToProjectId('developer', 'unikprompt');

    const heartbeatOverride: Record<string, HeartbeatRecord> = {
      developer: {
        agent: 'developer', org: 'unikprompt', status: 'online',
        mode: 'day',
        last_heartbeat: new Date(now.getTime() - 5 * 3600 * 1000).toISOString(),
      },
    };
    const projectDailyOverride: ProjectDailyMap = { [projId]: [
      { date: '2026-05-01', totalCost: 30, totalTokens: 1 },
      { date: '2026-04-30', totalCost: 8, totalTokens: 1 },
      { date: '2026-04-29', totalCost: 10, totalTokens: 1 },
      { date: '2026-04-28', totalCost: 9, totalTokens: 1 },
    ]};

    // First run: token_spike + heartbeat_stale both fire
    let result = detectAll({
      cfg: baseCfg, ctxRoot, now,
      agentsOverride: ['developer'],
      heartbeatOverride,
      tasksOverride: { developer: [] },
      projectDailyOverride,
    });
    expect(result.anomalies.length).toBe(2);
    expect(result.newly_fired.length).toBe(2);
    expect(result.suppressed_dedup).toBe(0);

    // Second run, 1h later: same anomalies, but dedup suppresses
    const later = new Date(now.getTime() + 1 * 3600 * 1000);
    heartbeatOverride.developer.last_heartbeat = new Date(later.getTime() - 5 * 3600 * 1000).toISOString();
    projectDailyOverride[projId][0].date = later.toISOString().slice(0, 10);
    result = detectAll({
      cfg: baseCfg, ctxRoot, now: later,
      agentsOverride: ['developer'],
      heartbeatOverride,
      tasksOverride: { developer: [] },
      projectDailyOverride,
    });
    expect(result.suppressed_dedup).toBe(2);
    expect(result.newly_fired.length).toBe(0);

    // Third run, 25h after first (past 24h dedup): re-fires
    const muchLater = new Date(now.getTime() + 25 * 3600 * 1000);
    heartbeatOverride.developer.last_heartbeat = new Date(muchLater.getTime() - 5 * 3600 * 1000).toISOString();
    projectDailyOverride[projId][0].date = muchLater.toISOString().slice(0, 10);
    result = detectAll({
      cfg: baseCfg, ctxRoot, now: muchLater,
      agentsOverride: ['developer'],
      heartbeatOverride,
      tasksOverride: { developer: [] },
      projectDailyOverride,
    });
    expect(result.newly_fired.length).toBe(2);
  });

  it('returns zero anomalies for healthy agent', () => {
    saveConfig(ctxRoot, baseCfg);
    const now = new Date('2026-05-01T12:00:00Z');
    const projId = agentToProjectId('developer', 'unikprompt');

    const result = detectAll({
      cfg: baseCfg, ctxRoot, now,
      agentsOverride: ['developer'],
      heartbeatOverride: {
        developer: {
          agent: 'developer', org: 'unikprompt', status: 'online',
          mode: 'day',
          last_heartbeat: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        },
      },
      tasksOverride: { developer: [] },
      projectDailyOverride: { [projId]: [
        { date: '2026-05-01', totalCost: 10, totalTokens: 1 },
        { date: '2026-04-30', totalCost: 8, totalTokens: 1 },
        { date: '2026-04-29', totalCost: 9, totalTokens: 1 },
        { date: '2026-04-28', totalCost: 11, totalTokens: 1 },
      ]},
    });
    expect(result.anomalies).toEqual([]);
    expect(result.newly_fired).toEqual([]);
  });

  it('agents_filter narrows the agent list', () => {
    saveConfig(ctxRoot, baseCfg);
    const cfg: AnomalyDetectionConfig = { ...baseCfg, agents_filter: ['developer'] };
    const now = new Date('2026-05-01T12:00:00Z');

    const result = detectAll({
      cfg, ctxRoot, now,
      // No agentsOverride: agents_filter from config should apply
      heartbeatOverride: {
        developer: {
          agent: 'developer', org: 'unikprompt', status: 'online',
          mode: 'day',
          last_heartbeat: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        },
      },
      tasksOverride: { developer: [] },
      projectDailyOverride: {},
    });
    expect(result.agents_checked).toBe(1);
  });
});
