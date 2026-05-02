import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { atomicWriteSync } from './atomic.js';

export type AnomalyRule = 'token_spike' | 'heartbeat_stale' | 'completion_drop';
export type AnomalySeverity = 'info' | 'warning' | 'critical';

export interface AnomalyDetectionConfig {
  enabled: boolean;
  notify_chat_id: string;
  token_multiplier: number;
  heartbeat_stale_hours: number;
  completion_drop_pct: number;
  baseline_window_days: number;
  dedup_hours: number;
  agents_filter: string[]; // empty = all agents
}

export interface AnomalyDetectionState {
  last_check_at: string | null;
  fired: Record<string, string>; // key = "<rule>:<agent>", value = ISO of last fire
}

export interface Anomaly {
  rule: AnomalyRule;
  severity: AnomalySeverity;
  agent: string;
  message: string;
  metric: number;
  baseline: number | null;
  details: Record<string, unknown>;
}

export const DEFAULT_CONFIG: AnomalyDetectionConfig = {
  enabled: true,
  notify_chat_id: '',
  token_multiplier: 2.5,
  heartbeat_stale_hours: 3,
  completion_drop_pct: 50,
  baseline_window_days: 7,
  dedup_hours: 24,
  agents_filter: [],
};

export function configPath(ctxRoot: string): string {
  return join(ctxRoot, 'config', 'anomaly-detection.json');
}

export function statePath(ctxRoot: string): string {
  return join(ctxRoot, 'state', 'anomaly-detection.json');
}

export function defaultCtxRoot(instance: string = 'default'): string {
  return join(homedir(), '.cortextos', instance);
}

export function loadConfig(ctxRoot: string): AnomalyDetectionConfig | null {
  const p = configPath(ctxRoot);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return null;
  }
}

export function saveConfig(ctxRoot: string, cfg: AnomalyDetectionConfig): void {
  mkdirSync(join(ctxRoot, 'config'), { recursive: true });
  atomicWriteSync(configPath(ctxRoot), JSON.stringify(cfg, null, 2));
}

export function loadState(ctxRoot: string): AnomalyDetectionState {
  const p = statePath(ctxRoot);
  if (!existsSync(p)) return { last_check_at: null, fired: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return {
      last_check_at: parsed.last_check_at ?? null,
      fired: typeof parsed.fired === 'object' && parsed.fired !== null ? parsed.fired : {},
    };
  } catch {
    return { last_check_at: null, fired: {} };
  }
}

export function saveState(ctxRoot: string, state: AnomalyDetectionState): void {
  mkdirSync(join(ctxRoot, 'state'), { recursive: true });
  atomicWriteSync(statePath(ctxRoot), JSON.stringify(state, null, 2));
}

export function listAgents(ctxRoot: string): string[] {
  const stateDir = join(ctxRoot, 'state');
  if (!existsSync(stateDir)) return [];
  return readdirSync(stateDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      const agentDir = join(stateDir, name);
      if (!existsSync(join(agentDir, 'heartbeat.json'))) return false;
      // Skip stopped agents (won't heartbeat by definition)
      if (existsSync(join(agentDir, '.user-stop'))) return false;
      if (existsSync(join(agentDir, '.daemon-stop'))) return false;
      return true;
    });
}

export interface HeartbeatRecord {
  agent: string;
  org: string;
  status: string;
  mode: 'day' | 'night' | string;
  last_heartbeat: string;
}

export function readHeartbeat(ctxRoot: string, agent: string): HeartbeatRecord | null {
  const p = join(ctxRoot, 'state', agent, 'heartbeat.json');
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    return {
      agent: String(parsed.agent || agent),
      org: String(parsed.org || ''),
      status: String(parsed.status || ''),
      mode: String(parsed.mode || 'unknown') as HeartbeatRecord['mode'],
      last_heartbeat: String(parsed.last_heartbeat || ''),
    };
  } catch {
    return null;
  }
}

export interface TaskRecord {
  id: string;
  assigned_to: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
}

export function readAgentTasks(ctxRoot: string, agent: string, agentOrg: string): TaskRecord[] {
  const tasksDir = join(ctxRoot, 'orgs', agentOrg, 'tasks');
  if (!existsSync(tasksDir)) return [];
  const out: TaskRecord[] = [];
  for (const name of readdirSync(tasksDir)) {
    if (!name.startsWith('task_') || !name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(tasksDir, name), 'utf-8'));
      if (parsed.assigned_to !== agent) continue;
      out.push({
        id: String(parsed.id),
        assigned_to: String(parsed.assigned_to),
        status: String(parsed.status),
        created_at: String(parsed.created_at),
        completed_at: parsed.completed_at ?? null,
      });
    } catch {
      // skip malformed
    }
  }
  return out;
}

export interface ProjectDailyEntry {
  date: string;
  totalCost: number;
  totalTokens: number;
}

export type ProjectDailyMap = Record<string, ProjectDailyEntry[]>;

export function readProjectDailyUsage(): ProjectDailyMap {
  let raw: string;
  try {
    raw = execFileSync('npx', ['-y', 'ccusage', 'daily', '-i', '-j'], {
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
  const projects = parsed?.projects;
  if (!projects || typeof projects !== 'object') return {};
  const out: ProjectDailyMap = {};
  for (const [projId, entries] of Object.entries(projects)) {
    if (!Array.isArray(entries)) continue;
    out[projId] = entries.map((e: any) => ({
      date: String(e.date),
      totalCost: Number(e.totalCost) || 0,
      totalTokens: Number(e.totalTokens) || 0,
    }));
  }
  return out;
}

export function agentToProjectId(agent: string, org: string): string {
  return `-Users-${process.env.USER || 'mariosmacstudio'}-cortextos-orgs-${org}-agents-${agent}`;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface DetectOptions {
  cfg: AnomalyDetectionConfig;
  ctxRoot: string;
  now?: Date;
  // Test injection points:
  heartbeatOverride?: Record<string, HeartbeatRecord>;
  tasksOverride?: Record<string, TaskRecord[]>;
  projectDailyOverride?: ProjectDailyMap;
  agentsOverride?: string[];
}

export function detectTokenSpike(
  agent: string,
  org: string,
  cfg: AnomalyDetectionConfig,
  projectDaily: ProjectDailyMap,
  now: Date,
): Anomaly | null {
  const projId = agentToProjectId(agent, org);
  const entries = projectDaily[projId];
  if (!entries || entries.length < 4) return null;

  const todayIso = now.toISOString().slice(0, 10);
  const todayEntry = entries.find((e) => e.date === todayIso);
  if (!todayEntry || todayEntry.totalCost === 0) return null;

  const baselineEntries = entries.filter(
    (e) => e.date !== todayIso && e.date >= isoDateOffset(now, -cfg.baseline_window_days),
  );
  if (baselineEntries.length < 3) return null;

  const baseline = median(baselineEntries.map((e) => e.totalCost));
  if (baseline === 0) return null;

  const ratio = todayEntry.totalCost / baseline;
  if (ratio < cfg.token_multiplier) return null;

  return {
    rule: 'token_spike',
    severity: 'warning',
    agent,
    message: `Token spike: agente ${agent} hoy gastó $${todayEntry.totalCost.toFixed(2)} = ${ratio.toFixed(1)}x su mediana de últimos ${cfg.baseline_window_days}d ($${baseline.toFixed(2)}). Threshold: ${cfg.token_multiplier}x.`,
    metric: todayEntry.totalCost,
    baseline,
    details: { ratio, baseline_window_days: cfg.baseline_window_days, today_cost: todayEntry.totalCost },
  };
}

export function detectHeartbeatStale(
  agent: string,
  cfg: AnomalyDetectionConfig,
  hb: HeartbeatRecord | null,
  now: Date,
): Anomaly | null {
  if (!hb) return null;
  if (hb.mode !== 'day') return null; // skip night mode
  if (!hb.last_heartbeat) return null;
  const lastMs = new Date(hb.last_heartbeat).getTime();
  if (isNaN(lastMs)) return null;
  const elapsedHours = (now.getTime() - lastMs) / (3600 * 1000);
  if (elapsedHours < cfg.heartbeat_stale_hours) return null;

  return {
    rule: 'heartbeat_stale',
    severity: 'critical',
    agent,
    message: `Agente ${agent} en day-mode sin heartbeat hace ${elapsedHours.toFixed(1)}h (último: ${hb.last_heartbeat}). Threshold: ${cfg.heartbeat_stale_hours}h.`,
    metric: elapsedHours,
    baseline: cfg.heartbeat_stale_hours,
    details: { last_heartbeat: hb.last_heartbeat, mode: hb.mode, status: hb.status },
  };
}

export function detectCompletionDrop(
  agent: string,
  cfg: AnomalyDetectionConfig,
  tasks: TaskRecord[],
  now: Date,
): Anomaly | null {
  const recentStart = isoOffset(now, -cfg.baseline_window_days * 24 * 3600 * 1000);
  const baselineStart = isoOffset(now, -cfg.baseline_window_days * 2 * 24 * 3600 * 1000);
  const recentTasks = tasks.filter((t) => t.created_at >= recentStart);
  const baselineTasks = tasks.filter(
    (t) => t.created_at >= baselineStart && t.created_at < recentStart,
  );
  if (recentTasks.length < 5 || baselineTasks.length < 5) return null;

  const recentRate = countCompleted(recentTasks) / recentTasks.length;
  const baselineRate = countCompleted(baselineTasks) / baselineTasks.length;
  if (baselineRate === 0) return null;

  const dropPct = ((baselineRate - recentRate) / baselineRate) * 100;
  if (dropPct < cfg.completion_drop_pct) return null;

  return {
    rule: 'completion_drop',
    severity: 'warning',
    agent,
    message: `Completion rate de ${agent} cayó ${dropPct.toFixed(0)}%: últimos ${cfg.baseline_window_days}d ${(recentRate * 100).toFixed(0)}% (${countCompleted(recentTasks)}/${recentTasks.length}) vs prev ${cfg.baseline_window_days}d ${(baselineRate * 100).toFixed(0)}% (${countCompleted(baselineTasks)}/${baselineTasks.length}). Threshold: ${cfg.completion_drop_pct}%.`,
    metric: recentRate,
    baseline: baselineRate,
    details: {
      recent_completed: countCompleted(recentTasks),
      recent_total: recentTasks.length,
      baseline_completed: countCompleted(baselineTasks),
      baseline_total: baselineTasks.length,
      drop_pct: dropPct,
    },
  };
}

function countCompleted(tasks: TaskRecord[]): number {
  return tasks.filter((t) => t.status === 'completed').length;
}

function isoDateOffset(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function isoOffset(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

export interface DetectResult {
  ok: true;
  enabled: boolean;
  anomalies: Anomaly[];
  newly_fired: Anomaly[];
  suppressed_dedup: number;
  agents_checked: number;
  checked_at: string;
}

export function detectAll(opts: DetectOptions): DetectResult {
  const now = opts.now ?? new Date();
  const state = loadState(opts.ctxRoot);
  const agents =
    opts.agentsOverride ??
    (opts.cfg.agents_filter.length > 0 ? opts.cfg.agents_filter : listAgents(opts.ctxRoot));

  const projectDaily =
    opts.projectDailyOverride ??
    (() => {
      try {
        return readProjectDailyUsage();
      } catch {
        return {};
      }
    })();

  const anomalies: Anomaly[] = [];
  for (const agent of agents) {
    const hb = opts.heartbeatOverride?.[agent] ?? readHeartbeat(opts.ctxRoot, agent);
    const org = hb?.org || 'unikprompt';

    const tokenAnomaly = detectTokenSpike(agent, org, opts.cfg, projectDaily, now);
    if (tokenAnomaly) anomalies.push(tokenAnomaly);

    const hbAnomaly = detectHeartbeatStale(agent, opts.cfg, hb, now);
    if (hbAnomaly) anomalies.push(hbAnomaly);

    const tasks = opts.tasksOverride?.[agent] ?? readAgentTasks(opts.ctxRoot, agent, org);
    const completionAnomaly = detectCompletionDrop(agent, opts.cfg, tasks, now);
    if (completionAnomaly) anomalies.push(completionAnomaly);
  }

  // Apply dedup
  const dedupMs = opts.cfg.dedup_hours * 3600 * 1000;
  const newlyFired: Anomaly[] = [];
  let suppressed = 0;
  for (const a of anomalies) {
    const key = `${a.rule}:${a.agent}`;
    const last = state.fired[key];
    if (last && now.getTime() - new Date(last).getTime() < dedupMs) {
      suppressed++;
      continue;
    }
    newlyFired.push(a);
    state.fired[key] = now.toISOString();
  }

  // Cleanup expired dedup entries (>2x dedup window)
  const cutoff = now.getTime() - 2 * dedupMs;
  for (const key of Object.keys(state.fired)) {
    if (new Date(state.fired[key]).getTime() < cutoff) {
      delete state.fired[key];
    }
  }

  state.last_check_at = now.toISOString();
  saveState(opts.ctxRoot, state);

  return {
    ok: true,
    enabled: opts.cfg.enabled,
    anomalies,
    newly_fired: newlyFired,
    suppressed_dedup: suppressed,
    agents_checked: agents.length,
    checked_at: now.toISOString(),
  };
}
