import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { atomicWriteSync } from './atomic.js';

export interface RoutineRunsConfig {
  daily_limit: number;
  thresholds_pct: number[];
  notify_chat_id: string;
  reset_hour_local: number;
  timezone: string;
  enabled: boolean;
}

export interface RoutineRunEntry {
  ts: string;
  note?: string;
}

export interface RoutineRunsState {
  current_period_start: string;
  count: number;
  fired_thresholds_pct: number[];
  log: RoutineRunEntry[];
  last_check_at: string | null;
}

export const DEFAULT_CONFIG: RoutineRunsConfig = {
  daily_limit: 15,
  thresholds_pct: [80, 100],
  notify_chat_id: '',
  reset_hour_local: 0,
  timezone: 'America/New_York',
  enabled: true,
};

export function configPath(ctxRoot: string): string {
  return join(ctxRoot, 'config', 'routine-runs.json');
}

export function statePath(ctxRoot: string): string {
  return join(ctxRoot, 'state', 'routine-runs.json');
}

export function defaultCtxRoot(instance: string = 'default'): string {
  return join(homedir(), '.cortextos', instance);
}

export function loadConfig(ctxRoot: string): RoutineRunsConfig | null {
  const p = configPath(ctxRoot);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return null;
  }
}

export function saveConfig(ctxRoot: string, cfg: RoutineRunsConfig): void {
  mkdirSync(join(ctxRoot, 'config'), { recursive: true });
  atomicWriteSync(configPath(ctxRoot), JSON.stringify(cfg, null, 2));
}

function emptyState(): RoutineRunsState {
  return {
    current_period_start: '',
    count: 0,
    fired_thresholds_pct: [],
    log: [],
    last_check_at: null,
  };
}

export function loadState(ctxRoot: string): RoutineRunsState {
  const p = statePath(ctxRoot);
  if (!existsSync(p)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return {
      current_period_start: parsed.current_period_start || '',
      count: Number(parsed.count) || 0,
      fired_thresholds_pct: Array.isArray(parsed.fired_thresholds_pct)
        ? parsed.fired_thresholds_pct
        : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
      last_check_at: parsed.last_check_at ?? null,
    };
  } catch {
    return emptyState();
  }
}

export function saveState(ctxRoot: string, state: RoutineRunsState): void {
  mkdirSync(join(ctxRoot, 'state'), { recursive: true });
  atomicWriteSync(statePath(ctxRoot), JSON.stringify(state, null, 2));
}

/**
 * Compute the most recent local-midnight (or configured reset-hour) at or before `now`,
 * expressed as a UTC ISO string. Daily counter for routine runs.
 */
export function periodStart(now: Date, timezone: string, resetHourLocal: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour') === '24' ? '0' : get('hour'));
  const minute = Number(get('minute'));
  const minutesSinceMidnight = hour * 60 + minute;
  const resetMinutes = resetHourLocal * 60;

  const daysBack = minutesSinceMidnight < resetMinutes ? 1 : 0;
  const localResetUtc = new Date(Date.UTC(year, month - 1, day - daysBack, resetHourLocal, 0, 0));
  const offsetMin = timezoneOffsetMinutes(localResetUtc, timezone);
  return new Date(localResetUtc.getTime() - offsetMin * 60_000).toISOString();
}

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

function rolloverIfNeeded(state: RoutineRunsState, periodStartIso: string): void {
  if (state.current_period_start !== periodStartIso) {
    state.current_period_start = periodStartIso;
    state.count = 0;
    state.fired_thresholds_pct = [];
    state.log = [];
  }
}

export interface LogOptions {
  cfg: RoutineRunsConfig;
  ctxRoot: string;
  note?: string;
  now?: Date;
}

export interface LogResult {
  ok: true;
  count: number;
  daily_limit: number;
  pct: number;
  period_start: string;
}

export function logRun(opts: LogOptions): LogResult {
  const now = opts.now ?? new Date();
  const periodStartIso = periodStart(now, opts.cfg.timezone, opts.cfg.reset_hour_local);
  const state = loadState(opts.ctxRoot);
  rolloverIfNeeded(state, periodStartIso);
  state.count += 1;
  state.log.push({ ts: now.toISOString(), ...(opts.note ? { note: opts.note } : {}) });
  saveState(opts.ctxRoot, state);
  return {
    ok: true,
    count: state.count,
    daily_limit: opts.cfg.daily_limit,
    pct: Math.round((state.count / opts.cfg.daily_limit) * 1000) / 10,
    period_start: periodStartIso,
  };
}

export interface ResetOptions {
  cfg: RoutineRunsConfig;
  ctxRoot: string;
  now?: Date;
}

export function resetCount(opts: ResetOptions): { ok: true; period_start: string } {
  const now = opts.now ?? new Date();
  const periodStartIso = periodStart(now, opts.cfg.timezone, opts.cfg.reset_hour_local);
  const state = loadState(opts.ctxRoot);
  state.current_period_start = periodStartIso;
  state.count = 0;
  state.fired_thresholds_pct = [];
  state.log = [];
  saveState(opts.ctxRoot, state);
  return { ok: true, period_start: periodStartIso };
}

export interface CheckOptions {
  cfg: RoutineRunsConfig;
  ctxRoot: string;
  now?: Date;
}

export interface CheckResult {
  ok: true;
  enabled: boolean;
  period_start: string;
  count: number;
  daily_limit: number;
  pct: number;
  thresholds_pct: number[];
  fired_thresholds_pct: number[];
  newly_fired_thresholds_pct: number[];
}

export function runCheck(opts: CheckOptions): CheckResult {
  const now = opts.now ?? new Date();
  const periodStartIso = periodStart(now, opts.cfg.timezone, opts.cfg.reset_hour_local);
  const state = loadState(opts.ctxRoot);
  rolloverIfNeeded(state, periodStartIso);

  const pct = opts.cfg.daily_limit > 0 ? (state.count / opts.cfg.daily_limit) * 100 : 0;
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
    count: state.count,
    daily_limit: opts.cfg.daily_limit,
    pct: Math.round(pct * 10) / 10,
    thresholds_pct: sortedThresholds,
    fired_thresholds_pct: state.fired_thresholds_pct,
    newly_fired_thresholds_pct: newlyFired,
  };
}
