import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { atomicWriteSync } from './atomic.js';

export type QuotaName = 'all' | 'sonnet';
export const QUOTA_NAMES: QuotaName[] = ['all', 'sonnet'];

export interface CostBudgetConfig {
  weekly_budget_usd: number;
  thresholds_pct: number[];
  // Optional dual-quota: if set, Sonnet usage is tracked as a separate paralle quota.
  // Anthropic enforces Sonnet-weekly and All-models-weekly as independent caps.
  sonnet_weekly_budget_usd?: number;
  sonnet_thresholds_pct?: number[];
  notify_chat_id: string;
  reset: {
    day_of_week:
      | 'sunday'
      | 'monday'
      | 'tuesday'
      | 'wednesday'
      | 'thursday'
      | 'friday'
      | 'saturday';
    hour_local: number;
    timezone: string;
  };
  enabled: boolean;
}

export interface CostBudgetState {
  current_period_start: string;
  // Per-quota fired thresholds. Legacy `fired_thresholds_pct` is migrated into
  // `fired_thresholds.all` on first load.
  fired_thresholds: Record<QuotaName, number[]>;
  // Kept for one-version backward compat with code that still reads this field.
  fired_thresholds_pct: number[];
  last_check_at: string | null;
}

export interface ModelBreakdown {
  modelName: string;
  cost: number;
}

export interface DailyEntry {
  date: string;
  totalCost: number;
  totalTokens: number;
  modelBreakdowns?: ModelBreakdown[];
}

export const DEFAULT_BUDGET: CostBudgetConfig = {
  weekly_budget_usd: 100,
  thresholds_pct: [50, 80, 100],
  notify_chat_id: '',
  reset: {
    day_of_week: 'friday',
    hour_local: 1,
    timezone: 'America/New_York',
  },
  enabled: true,
};

const DAY_INDEX: Record<CostBudgetConfig['reset']['day_of_week'], number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function configPath(ctxRoot: string): string {
  return join(ctxRoot, 'config', 'cost-budget.json');
}

export function statePath(ctxRoot: string): string {
  return join(ctxRoot, 'state', 'cost-budget.json');
}

export function defaultCtxRoot(instance: string = 'default'): string {
  return join(homedir(), '.cortextos', instance);
}

export function loadConfig(ctxRoot: string): CostBudgetConfig | null {
  const p = configPath(ctxRoot);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return { ...DEFAULT_BUDGET, ...parsed };
  } catch {
    return null;
  }
}

export function saveConfig(ctxRoot: string, cfg: CostBudgetConfig): void {
  mkdirSync(join(ctxRoot, 'config'), { recursive: true });
  atomicWriteSync(configPath(ctxRoot), JSON.stringify(cfg, null, 2));
}

function emptyState(): CostBudgetState {
  return {
    current_period_start: '',
    fired_thresholds: { all: [], sonnet: [] },
    fired_thresholds_pct: [],
    last_check_at: null,
  };
}

export function loadState(ctxRoot: string): CostBudgetState {
  const p = statePath(ctxRoot);
  if (!existsSync(p)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    const legacyArr: number[] = Array.isArray(parsed.fired_thresholds_pct)
      ? parsed.fired_thresholds_pct
      : [];
    const ft: Record<QuotaName, number[]> = {
      all: Array.isArray(parsed?.fired_thresholds?.all)
        ? parsed.fired_thresholds.all
        : legacyArr,
      sonnet: Array.isArray(parsed?.fired_thresholds?.sonnet)
        ? parsed.fired_thresholds.sonnet
        : [],
    };
    return {
      current_period_start: parsed.current_period_start || '',
      fired_thresholds: ft,
      fired_thresholds_pct: ft.all,
      last_check_at: parsed.last_check_at ?? null,
    };
  } catch {
    return emptyState();
  }
}

export function saveState(ctxRoot: string, state: CostBudgetState): void {
  mkdirSync(join(ctxRoot, 'state'), { recursive: true });
  atomicWriteSync(statePath(ctxRoot), JSON.stringify(state, null, 2));
}

/**
 * Compute the most recent reset boundary at-or-before `now` in the configured timezone.
 * Returns a UTC ISO string for the wall-clock instant of that reset.
 */
export function periodStart(now: Date, cfg: CostBudgetConfig['reset']): string {
  const targetDow = DAY_INDEX[cfg.day_of_week];
  // Express `now` in the configured timezone using Intl
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: cfg.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour') === '24' ? '0' : get('hour'));
  const minute = Number(get('minute'));
  const weekdayShort = get('weekday').toLowerCase();
  const dowMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const localDow = dowMap[weekdayShort.slice(0, 3)];
  const minutesSinceMidnight = hour * 60 + minute;
  const resetMinutes = cfg.hour_local * 60;

  let daysBack = (localDow - targetDow + 7) % 7;
  if (daysBack === 0 && minutesSinceMidnight < resetMinutes) {
    daysBack = 7;
  }

  const localResetDate = new Date(Date.UTC(year, month - 1, day - daysBack, cfg.hour_local, 0, 0));
  // localResetDate is the wall-clock UTC representation of the local reset time.
  // To get the actual UTC instant, subtract the timezone offset at that wall-clock.
  const offsetMinutes = timezoneOffsetMinutes(localResetDate, cfg.timezone);
  const utcInstant = new Date(localResetDate.getTime() - offsetMinutes * 60_000);
  return utcInstant.toISOString();
}

/**
 * Returns the offset (in minutes) of `tz` from UTC at the given wall-clock instant.
 * Positive for zones ahead of UTC, negative for zones behind (e.g. ET = -300 in EST, -240 in EDT).
 */
function timezoneOffsetMinutes(wallClockUtc: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(wallClockUtc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || '0');
  const tzAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((tzAsUtc - wallClockUtc.getTime()) / 60_000);
}

export function readDailyUsage(): DailyEntry[] {
  let raw: string;
  try {
    raw = execFileSync('npx', ['-y', 'ccusage', 'daily', '-j'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    });
  } catch (err: any) {
    throw new Error(`ccusage failed: ${err.message || err}`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('ccusage returned non-JSON output');
  }
  const arr = Array.isArray(parsed?.daily) ? parsed.daily : [];
  return arr.map((d: any) => ({
    date: String(d.date),
    totalCost: Number(d.totalCost) || 0,
    totalTokens: Number(d.totalTokens) || 0,
    modelBreakdowns: Array.isArray(d.modelBreakdowns)
      ? d.modelBreakdowns
          .map((m: any) => ({
            modelName: String(m.modelName ?? ''),
            cost: Number(m.cost) || 0,
          }))
          .filter((m: ModelBreakdown) => m.modelName)
      : undefined,
  }));
}

export function isSonnetModel(modelName: string): boolean {
  return /sonnet/i.test(modelName);
}

export interface QuotaResult {
  weekly_budget_usd: number;
  spent_usd: number;
  pct: number;
  projected_eow_usd: number;
  projected_pct: number;
  thresholds_pct: number[];
  fired_thresholds_pct: number[];
  newly_fired_thresholds_pct: number[];
}

export interface CheckResult {
  ok: true;
  enabled: boolean;
  period_start: string;
  days_into_period: number;
  days_in_period: number;
  // Backward-compat top-level aliases (mirror quotas.all). Kept so existing code
  // that reads `result.spent_usd`, `result.pct`, etc., keeps working.
  weekly_budget_usd: number;
  spent_usd: number;
  pct: number;
  projected_eow_usd: number;
  projected_pct: number;
  thresholds_pct: number[];
  fired_thresholds_pct: number[];
  newly_fired_thresholds_pct: number[];
  // Per-quota breakdown. `all` is always present; `sonnet` only when configured.
  quotas: { all: QuotaResult; sonnet?: QuotaResult };
}

export function sumSpent(
  daily: DailyEntry[],
  periodStartIso: string,
  now: Date,
  modelFilter?: QuotaName,
): number {
  const startMs = new Date(periodStartIso).getTime();
  const endMs = now.getTime();
  let total = 0;
  for (const d of daily) {
    const ts = new Date(d.date + 'T12:00:00Z').getTime();
    if (ts < startMs || ts > endMs + 24 * 60 * 60 * 1000) continue;
    if (modelFilter === 'sonnet') {
      // Sum only Sonnet model entries from the per-day breakdown.
      // Days without modelBreakdowns are silently skipped (no Sonnet attribution).
      const breakdowns = d.modelBreakdowns ?? [];
      for (const m of breakdowns) {
        if (isSonnetModel(m.modelName)) total += m.cost;
      }
    } else {
      total += d.totalCost;
    }
  }
  return total;
}

export function project(spent: number, daysInto: number, daysTotal: number): number {
  if (daysInto <= 0) return spent;
  const dailyRate = spent / daysInto;
  return dailyRate * daysTotal;
}

export interface CheckOptions {
  cfg: CostBudgetConfig;
  ctxRoot: string;
  now?: Date;
  dailyOverride?: DailyEntry[]; // for tests
}

function computeQuota(
  daily: DailyEntry[],
  periodStartIso: string,
  now: Date,
  budgetUsd: number,
  thresholds: number[],
  daysInto: number,
  daysInPeriod: number,
  firedAlready: number[],
  modelFilter?: QuotaName,
): { result: QuotaResult; firedNow: number[] } {
  const spent = sumSpent(daily, periodStartIso, now, modelFilter);
  const pct = budgetUsd > 0 ? (spent / budgetUsd) * 100 : 0;
  const projectedEow = project(spent, daysInto, daysInPeriod);
  const projectedPct = budgetUsd > 0 ? (projectedEow / budgetUsd) * 100 : 0;

  const sortedThresholds = [...thresholds].sort((a, b) => a - b);
  const newlyFired: number[] = [];
  const allFired = [...firedAlready];
  for (const t of sortedThresholds) {
    if (pct >= t && !allFired.includes(t)) {
      newlyFired.push(t);
      allFired.push(t);
    }
  }
  return {
    result: {
      weekly_budget_usd: budgetUsd,
      spent_usd: Math.round(spent * 100) / 100,
      pct: Math.round(pct * 10) / 10,
      projected_eow_usd: Math.round(projectedEow * 100) / 100,
      projected_pct: Math.round(projectedPct * 10) / 10,
      thresholds_pct: sortedThresholds,
      fired_thresholds_pct: allFired,
      newly_fired_thresholds_pct: newlyFired,
    },
    firedNow: allFired,
  };
}

export function runCheck(opts: CheckOptions): CheckResult {
  const now = opts.now ?? new Date();
  const periodStartIso = periodStart(now, opts.cfg.reset);
  const state = loadState(opts.ctxRoot);

  // Period rollover: reset fired thresholds for every quota.
  if (state.current_period_start !== periodStartIso) {
    state.current_period_start = periodStartIso;
    state.fired_thresholds = { all: [], sonnet: [] };
  }

  const daily = opts.dailyOverride ?? readDailyUsage();

  const startMs = new Date(periodStartIso).getTime();
  const elapsedMs = now.getTime() - startMs;
  const daysInto = Math.max(0.001, elapsedMs / (24 * 60 * 60 * 1000));
  const daysInPeriod = 7;

  const allQuota = computeQuota(
    daily,
    periodStartIso,
    now,
    opts.cfg.weekly_budget_usd,
    opts.cfg.thresholds_pct,
    daysInto,
    daysInPeriod,
    state.fired_thresholds.all,
  );
  state.fired_thresholds.all = allQuota.firedNow;

  let sonnetResult: QuotaResult | undefined;
  if (opts.cfg.sonnet_weekly_budget_usd && opts.cfg.sonnet_weekly_budget_usd > 0) {
    const sonnetThresholds = opts.cfg.sonnet_thresholds_pct ?? opts.cfg.thresholds_pct;
    const sonnetQuota = computeQuota(
      daily,
      periodStartIso,
      now,
      opts.cfg.sonnet_weekly_budget_usd,
      sonnetThresholds,
      daysInto,
      daysInPeriod,
      state.fired_thresholds.sonnet,
      'sonnet',
    );
    state.fired_thresholds.sonnet = sonnetQuota.firedNow;
    sonnetResult = sonnetQuota.result;
  }

  // Mirror to legacy fields so existing readers keep working.
  state.fired_thresholds_pct = state.fired_thresholds.all;
  state.last_check_at = now.toISOString();
  saveState(opts.ctxRoot, state);

  const r = allQuota.result;
  return {
    ok: true,
    enabled: opts.cfg.enabled,
    period_start: periodStartIso,
    days_into_period: Math.round(daysInto * 10) / 10,
    days_in_period: daysInPeriod,
    weekly_budget_usd: r.weekly_budget_usd,
    spent_usd: r.spent_usd,
    pct: r.pct,
    projected_eow_usd: r.projected_eow_usd,
    projected_pct: r.projected_pct,
    thresholds_pct: r.thresholds_pct,
    fired_thresholds_pct: r.fired_thresholds_pct,
    newly_fired_thresholds_pct: r.newly_fired_thresholds_pct,
    quotas: { all: r, ...(sonnetResult ? { sonnet: sonnetResult } : {}) },
  };
}
