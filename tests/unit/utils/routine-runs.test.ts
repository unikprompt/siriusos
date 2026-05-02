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
  periodStart,
  logRun,
  resetCount,
  runCheck,
  DEFAULT_CONFIG,
  type RoutineRunsConfig,
} from '../../../src/utils/routine-runs';

let ctxRoot: string;

beforeEach(() => {
  ctxRoot = join(tmpdir(), `rr-${randomBytes(6).toString('hex')}`);
  mkdirSync(ctxRoot, { recursive: true });
});

afterEach(() => {
  rmSync(ctxRoot, { recursive: true, force: true });
});

const baseCfg: RoutineRunsConfig = {
  ...DEFAULT_CONFIG,
  daily_limit: 15,
  thresholds_pct: [80, 100],
  notify_chat_id: '270021643',
  reset_hour_local: 0,
  timezone: 'America/New_York',
};

describe('routine-runs config + state IO', () => {
  it('loadConfig returns null when missing', () => {
    expect(loadConfig(ctxRoot)).toBeNull();
  });

  it('save and reload config round-trips', () => {
    saveConfig(ctxRoot, baseCfg);
    const loaded = loadConfig(ctxRoot);
    expect(loaded?.daily_limit).toBe(15);
    expect(loaded?.thresholds_pct).toEqual([80, 100]);
    expect(loaded?.notify_chat_id).toBe('270021643');
    expect(existsSync(configPath(ctxRoot))).toBe(true);
  });

  it('loadState returns empty when missing', () => {
    const s = loadState(ctxRoot);
    expect(s.count).toBe(0);
    expect(s.fired_thresholds_pct).toEqual([]);
    expect(s.log).toEqual([]);
    expect(s.current_period_start).toBe('');
  });

  it('handles malformed config + state files', () => {
    mkdirSync(join(ctxRoot, 'config'), { recursive: true });
    mkdirSync(join(ctxRoot, 'state'), { recursive: true });
    writeFileSync(configPath(ctxRoot), '{not-json');
    writeFileSync(statePath(ctxRoot), '{not-json');
    expect(loadConfig(ctxRoot)).toBeNull();
    expect(loadState(ctxRoot).count).toBe(0);
  });
});

describe('periodStart — daily reset', () => {
  it('returns today midnight ET when called Tuesday afternoon ET', () => {
    // 2026-04-29 (Tue) 17:00 UTC = 13:00 EDT
    const now = new Date('2026-04-29T17:00:00Z');
    const ps = periodStart(now, 'America/New_York', 0);
    // Today's midnight EDT = 2026-04-29 00:00 EDT = 2026-04-29T04:00:00Z
    expect(ps).toBe('2026-04-29T04:00:00.000Z');
  });

  it('returns previous-day reset when called before reset hour', () => {
    // 2026-04-29 03:00 UTC = 23:00 EDT on 2026-04-28 (before 0:00 reset on the 29th)
    const now = new Date('2026-04-29T03:00:00Z');
    const ps = periodStart(now, 'America/New_York', 0);
    expect(ps).toBe('2026-04-28T04:00:00.000Z');
  });

  it('honors a non-midnight reset_hour_local', () => {
    // Reset at 6am ET. At 5am ET on 2026-04-29 → still previous period (2026-04-28 06:00 ET)
    const now = new Date('2026-04-29T09:00:00Z'); // 05:00 EDT
    const ps = periodStart(now, 'America/New_York', 6);
    expect(ps).toBe('2026-04-28T10:00:00.000Z'); // 06:00 EDT = 10:00 UTC
  });
});

describe('logRun', () => {
  it('increments count from zero, persists log entry, resets on rollover', () => {
    saveConfig(ctxRoot, baseCfg);

    let r = logRun({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T15:00:00Z'), note: 'morning summary' });
    expect(r.count).toBe(1);
    expect(r.daily_limit).toBe(15);
    expect(r.pct).toBeCloseTo(6.7, 1);

    r = logRun({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T16:00:00Z'), note: 'evening report' });
    expect(r.count).toBe(2);

    let s = loadState(ctxRoot);
    expect(s.log.length).toBe(2);
    expect(s.log[0].note).toBe('morning summary');

    // Next-day call → counter resets, log cleared
    r = logRun({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-30T15:00:00Z') });
    expect(r.count).toBe(1);
    s = loadState(ctxRoot);
    expect(s.log.length).toBe(1);
  });
});

describe('runCheck', () => {
  it('fires thresholds in order, persists fired state, resets on rollover', () => {
    saveConfig(ctxRoot, baseCfg);

    // Manually set state to simulate prior logs without writing 12 entries
    saveState(ctxRoot, {
      current_period_start: '2026-04-29T04:00:00.000Z',
      count: 12,
      fired_thresholds_pct: [],
      log: [],
      last_check_at: null,
    });

    // 12/15 = 80% → fires 80
    let r = runCheck({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T15:00:00Z') });
    expect(r.count).toBe(12);
    expect(r.pct).toBe(80);
    expect(r.newly_fired_thresholds_pct).toEqual([80]);

    // Re-run same period: no re-fire
    r = runCheck({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T16:00:00Z') });
    expect(r.newly_fired_thresholds_pct).toEqual([]);
    expect(r.fired_thresholds_pct).toEqual([80]);

    // Bump count to 15/15 → fires 100
    saveState(ctxRoot, {
      ...loadState(ctxRoot),
      count: 15,
    });
    r = runCheck({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T17:00:00Z') });
    expect(r.pct).toBe(100);
    expect(r.newly_fired_thresholds_pct).toEqual([100]);

    // Next day rollover → fired list resets, count back to zero
    r = runCheck({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-30T15:00:00Z') });
    expect(r.count).toBe(0);
    expect(r.fired_thresholds_pct).toEqual([]);
  });

  it('crosses multiple thresholds in a single check', () => {
    saveConfig(ctxRoot, baseCfg);
    saveState(ctxRoot, {
      current_period_start: '2026-04-29T04:00:00.000Z',
      count: 16, // 106% — over both thresholds
      fired_thresholds_pct: [],
      log: [],
      last_check_at: null,
    });
    const r = runCheck({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T15:00:00Z') });
    expect(r.newly_fired_thresholds_pct).toEqual([80, 100]);
    expect(r.fired_thresholds_pct).toEqual([80, 100]);
  });
});

describe('resetCount', () => {
  it('clears count, fired thresholds and log without affecting config', () => {
    saveConfig(ctxRoot, baseCfg);
    logRun({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T15:00:00Z'), note: 'a' });
    logRun({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T16:00:00Z'), note: 'b' });
    runCheck({ cfg: { ...baseCfg, thresholds_pct: [10] }, ctxRoot, now: new Date('2026-04-29T17:00:00Z') });
    expect(loadState(ctxRoot).count).toBe(2);

    const r = resetCount({ cfg: baseCfg, ctxRoot, now: new Date('2026-04-29T18:00:00Z') });
    expect(r.ok).toBe(true);
    const s = loadState(ctxRoot);
    expect(s.count).toBe(0);
    expect(s.fired_thresholds_pct).toEqual([]);
    expect(s.log).toEqual([]);
    // Config should still load fine
    expect(loadConfig(ctxRoot)?.daily_limit).toBe(15);
  });
});
