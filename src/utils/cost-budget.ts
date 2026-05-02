import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { atomicWriteSync } from './atomic.js';

export interface CostBudgetConfig {
  weekly_budget_usd: number;
  thresholds_pct: number[];
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
  fired_thresholds_pct: number[];
  last_check_at: string | null;
}

export interface DailyEntry {
  date: string;
  totalCost: number;
  totalTokens: number;
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

export function loadState(ctxRoot: string): CostBudgetState {
  const p = statePath(ctxRoot);
  if (!existsSync(p)) {
    return { current_period_start: '', fired_thresholds_pct: [], last_check_at: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return {
      current_period_start: parsed.current_period_start || '',
      fired_thresholds_pct: Array.isArray(parsed.fired_thresholds_pct)
        ? parsed.fired_thresholds_pct
        : [],
      last_check_at: parsed.last_check_at ?? null,
    };
  } catch {
    return { current_period_start: '', fired_thresholds_pct: [], last_check_at: null };
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
  }));
}

export interface CheckResult {
  ok: true;
  enabled: boolean;
  period_start: string;
  weekly_budget_usd: number;
  spent_usd: number;
  pct: number;
  projected_eow_usd: number;
  projected_pct: number;
  days_into_period: number;
  days_in_period: number;
  thresholds_pct: number[];
  fired_thresholds_pct: number[];
  newly_fired_thresholds_pct: number[];
}

export function sumSpent(daily: DailyEntry[], periodStartIso: string, now: Date): number {
  const startMs = new Date(periodStartIso).getTime();
  const endMs = now.getTime();
  let total = 0;
  for (const d of daily) {
    const ts = new Date(d.date + 'T12:00:00Z').getTime();
    if (ts >= startMs && ts <= endMs + 24 * 60 * 60 * 1000) total += d.totalCost;
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

export function runCheck(opts: CheckOptions): CheckResult {
  const now = opts.now ?? new Date();
  const periodStartIso = periodStart(now, opts.cfg.reset);
  const state = loadState(opts.ctxRoot);

  // If the period rolled over since last check, reset fired thresholds.
  if (state.current_period_start !== periodStartIso) {
    state.current_period_start = periodStartIso;
    state.fired_thresholds_pct = [];
  }

  const daily = opts.dailyOverride ?? readDailyUsage();
  const spent = sumSpent(daily, periodStartIso, now);
  const pct = (spent / opts.cfg.weekly_budget_usd) * 100;

  const startMs = new Date(periodStartIso).getTime();
  const elapsedMs = now.getTime() - startMs;
  const daysInto = Math.max(0.001, elapsedMs / (24 * 60 * 60 * 1000));
  const daysInPeriod = 7;
  const projectedEow = project(spent, daysInto, daysInPeriod);
  const projectedPct = (projectedEow / opts.cfg.weekly_budget_usd) * 100;

  const sortedThresholds = [...opts.cfg.thresholds_pct].sort((a, b) => a - b);
  const newlyFired: number[] = [];
  for (const t of sortedThresholds) {
    if (pct >= t && !state.fired_thresholds_pct.includes(t)) {
      newlyFired.push(t);
      state.fired_thresholds_pct.push(t);
    }
  }
  state.last_check_at = now.toISOString();
  saveState(opts.ctxRoot, state);

  return {
    ok: true,
    enabled: opts.cfg.enabled,
    period_start: periodStartIso,
    weekly_budget_usd: opts.cfg.weekly_budget_usd,
    spent_usd: Math.round(spent * 100) / 100,
    pct: Math.round(pct * 10) / 10,
    projected_eow_usd: Math.round(projectedEow * 100) / 100,
    projected_pct: Math.round(projectedPct * 10) / 10,
    days_into_period: Math.round(daysInto * 10) / 10,
    days_in_period: daysInPeriod,
    thresholds_pct: sortedThresholds,
    fired_thresholds_pct: state.fired_thresholds_pct,
    newly_fired_thresholds_pct: newlyFired,
  };
}
