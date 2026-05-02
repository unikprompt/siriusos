import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
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
  sumSpent,
  project,
  runCheck,
  DEFAULT_BUDGET,
  type CostBudgetConfig,
  type DailyEntry,
} from '../../../src/utils/cost-budget';

let ctxRoot: string;

beforeEach(() => {
  ctxRoot = join(tmpdir(), `cb-${randomBytes(6).toString('hex')}`);
  mkdirSync(ctxRoot, { recursive: true });
});

afterEach(() => {
  rmSync(ctxRoot, { recursive: true, force: true });
});

const baseCfg: CostBudgetConfig = {
  ...DEFAULT_BUDGET,
  weekly_budget_usd: 100,
  thresholds_pct: [50, 80, 100],
  notify_chat_id: '270021643',
};

describe('cost-budget config + state IO', () => {
  it('loadConfig returns null when missing', () => {
    expect(loadConfig(ctxRoot)).toBeNull();
  });

  it('save and reload config round-trips', () => {
    saveConfig(ctxRoot, baseCfg);
    const loaded = loadConfig(ctxRoot);
    expect(loaded?.weekly_budget_usd).toBe(100);
    expect(loaded?.thresholds_pct).toEqual([50, 80, 100]);
    expect(loaded?.notify_chat_id).toBe('270021643');
    expect(existsSync(configPath(ctxRoot))).toBe(true);
  });

  it('loadState returns empty when missing', () => {
    const s = loadState(ctxRoot);
    expect(s.fired_thresholds_pct).toEqual([]);
    expect(s.current_period_start).toBe('');
  });

  it('save and reload state round-trips', () => {
    saveState(ctxRoot, {
      current_period_start: '2026-04-25T05:00:00Z',
      fired_thresholds_pct: [50, 80],
      last_check_at: '2026-04-30T12:00:00Z',
    });
    const s = loadState(ctxRoot);
    expect(s.fired_thresholds_pct).toEqual([50, 80]);
    expect(existsSync(statePath(ctxRoot))).toBe(true);
  });

  it('handles malformed config + state files', () => {
    mkdirSync(join(ctxRoot, 'config'), { recursive: true });
    mkdirSync(join(ctxRoot, 'state'), { recursive: true });
    require('fs').writeFileSync(configPath(ctxRoot), '{not-json');
    require('fs').writeFileSync(statePath(ctxRoot), '{not-json');
    expect(loadConfig(ctxRoot)).toBeNull();
    expect(loadState(ctxRoot).fired_thresholds_pct).toEqual([]);
  });
});

describe('periodStart computation', () => {
  it('returns most recent Friday 1am ET when called Wednesday afternoon ET', () => {
    // 2026-04-29 (Wed) 17:00 UTC = 13:00 EDT
    const now = new Date('2026-04-29T17:00:00Z');
    const ps = periodStart(now, baseCfg.reset);
    // Most recent Friday 1am ET = 2026-04-24 01:00 EDT = 2026-04-24T05:00:00Z
    expect(ps).toBe('2026-04-24T05:00:00.000Z');
  });

  it('returns previous Friday when called early Friday before reset hour', () => {
    // Friday 2026-05-01 04:00 UTC = 00:00 EDT (before 1am reset)
    const now = new Date('2026-05-01T04:00:00Z');
    const ps = periodStart(now, baseCfg.reset);
    // Should still be previous Friday: 2026-04-24 05:00 UTC
    expect(ps).toBe('2026-04-24T05:00:00.000Z');
  });

  it('returns current Friday when called Friday after reset hour', () => {
    // Friday 2026-05-01 06:00 UTC = 02:00 EDT (after 1am reset)
    const now = new Date('2026-05-01T06:00:00Z');
    const ps = periodStart(now, baseCfg.reset);
    expect(ps).toBe('2026-05-01T05:00:00.000Z');
  });
});

describe('sumSpent + project', () => {
  const periodStartIso = '2026-04-24T05:00:00Z';
  const daily: DailyEntry[] = [
    { date: '2026-04-23', totalCost: 5, totalTokens: 1000 }, // before period — skip
    { date: '2026-04-24', totalCost: 8, totalTokens: 2000 },
    { date: '2026-04-25', totalCost: 12, totalTokens: 3000 },
    { date: '2026-04-26', totalCost: 7, totalTokens: 1500 },
  ];

  it('sums only entries within period', () => {
    const total = sumSpent(daily, periodStartIso, new Date('2026-04-26T23:00:00Z'));
    expect(total).toBe(8 + 12 + 7);
  });

  it('project extrapolates linearly', () => {
    expect(project(50, 3.5, 7)).toBeCloseTo(100, 5);
    expect(project(0, 0, 7)).toBe(0);
  });
});

describe('runCheck', () => {
  it('fires thresholds in order, persists fired state, resets on period rollover', () => {
    saveConfig(ctxRoot, baseCfg);
    const periodStartA = '2026-04-24T05:00:00Z';

    // First check at $30/100 — under all thresholds
    let r = runCheck({
      cfg: baseCfg,
      ctxRoot,
      now: new Date('2026-04-25T12:00:00Z'),
      dailyOverride: [{ date: '2026-04-24', totalCost: 30, totalTokens: 1 }],
    });
    expect(r.spent_usd).toBe(30);
    expect(r.pct).toBe(30);
    expect(r.newly_fired_thresholds_pct).toEqual([]);
    expect(r.fired_thresholds_pct).toEqual([]);

    // Second check at $55 — crosses 50
    r = runCheck({
      cfg: baseCfg,
      ctxRoot,
      now: new Date('2026-04-26T12:00:00Z'),
      dailyOverride: [
        { date: '2026-04-24', totalCost: 30, totalTokens: 1 },
        { date: '2026-04-26', totalCost: 25, totalTokens: 1 },
      ],
    });
    expect(r.pct).toBe(55);
    expect(r.newly_fired_thresholds_pct).toEqual([50]);
    expect(r.fired_thresholds_pct).toEqual([50]);

    // Third check at $85 — crosses 80, does NOT re-fire 50
    r = runCheck({
      cfg: baseCfg,
      ctxRoot,
      now: new Date('2026-04-27T12:00:00Z'),
      dailyOverride: [
        { date: '2026-04-24', totalCost: 30, totalTokens: 1 },
        { date: '2026-04-26', totalCost: 25, totalTokens: 1 },
        { date: '2026-04-27', totalCost: 30, totalTokens: 1 },
      ],
    });
    expect(r.pct).toBe(85);
    expect(r.newly_fired_thresholds_pct).toEqual([80]);
    expect(r.fired_thresholds_pct).toEqual([50, 80]);

    // Fourth check after period rollover — fired list resets
    r = runCheck({
      cfg: baseCfg,
      ctxRoot,
      now: new Date('2026-05-01T06:00:00Z'),
      dailyOverride: [
        { date: '2026-05-01', totalCost: 60, totalTokens: 1 },
      ],
    });
    expect(r.period_start).toBe('2026-05-01T05:00:00.000Z');
    expect(r.spent_usd).toBe(60);
    expect(r.pct).toBe(60);
    expect(r.newly_fired_thresholds_pct).toEqual([50]);
    expect(r.fired_thresholds_pct).toEqual([50]);
  });

  it('crosses multiple thresholds in a single check', () => {
    saveConfig(ctxRoot, baseCfg);
    const r = runCheck({
      cfg: baseCfg,
      ctxRoot,
      now: new Date('2026-04-26T12:00:00Z'),
      dailyOverride: [{ date: '2026-04-24', totalCost: 105, totalTokens: 1 }],
    });
    expect(r.pct).toBe(105);
    expect(r.newly_fired_thresholds_pct).toEqual([50, 80, 100]);
    expect(r.fired_thresholds_pct).toEqual([50, 80, 100]);
  });

  it('projection extrapolates correctly partway through period', () => {
    saveConfig(ctxRoot, baseCfg);
    // 2 days into 7-day period, $20 spent → projected $70
    const r = runCheck({
      cfg: baseCfg,
      ctxRoot,
      now: new Date('2026-04-26T05:00:00Z'),
      dailyOverride: [{ date: '2026-04-24', totalCost: 20, totalTokens: 1 }],
    });
    expect(r.days_into_period).toBeCloseTo(2.0, 0);
    expect(r.projected_eow_usd).toBeCloseTo(70, 0);
  });
});
