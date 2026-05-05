/**
 * Structured heartbeat wrap.
 *
 * Replaces the 4-step manual sequence in HEARTBEAT.md (update-heartbeat +
 * log-event + update-cron-fire + memory write) with a single call that runs
 * each step independently and surfaces per-step status. Partial failures are
 * never silently swallowed — the result object reports each substep so callers
 * can detect e.g. a successful heartbeat update with a failed cron-fire write.
 *
 * Inspired by OpenClaw 2026.5.2 (#75765 — heartbeat_respond tool).
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { BusPaths } from '../types/index.js';
import { updateHeartbeat } from './heartbeat.js';
import { logEvent } from './event.js';
import { updateCronFire } from './cron-state.js';

export type HeartbeatRespondStatus = 'ok' | 'degraded' | 'blocked';

export interface HeartbeatRespondOptions {
  status: HeartbeatRespondStatus;
  inboxCount?: number;
  tasksCount?: number;
  next?: string;
  note?: string;
  /** Heartbeat current_task field (passed through to update-heartbeat). */
  task?: string;
  /** Cron name to update. Defaults to "heartbeat". */
  cronName?: string;
  /** Cron interval string ("8h", "30m"). Optional. */
  cronInterval?: string;
  /** Loop interval forwarded to update-heartbeat. */
  loopInterval?: string;
  /** Display name forwarded to update-heartbeat. */
  displayName?: string;
  /** Timezone forwarded to update-heartbeat. */
  timezone?: string;
  /** Directory holding YYYY-MM-DD.md memory files. Defaults to <cwd>/memory. */
  memoryDir?: string;
  /** When true, skip the daily-memory append step entirely. */
  skipMemory?: boolean;
}

export interface SubstepResult {
  ok: boolean;
  error?: string;
}

export interface HeartbeatRespondResult {
  status: HeartbeatRespondStatus;
  heartbeat: SubstepResult;
  event: SubstepResult;
  cronFire: SubstepResult;
  memory: SubstepResult & { path?: string; skipped?: boolean };
  /** True only if every non-skipped substep succeeded. */
  allOk: boolean;
}

/**
 * Map the public status enum to the heartbeat.json status string.
 * Kept narrow on purpose: anything unexpected falls back to the literal value
 * so debugging is straightforward.
 */
function mapStatusToHeartbeatString(status: HeartbeatRespondStatus): string {
  switch (status) {
    case 'ok':
      return 'online';
    case 'degraded':
      return 'degraded';
    case 'blocked':
      return 'blocked';
    default:
      return status;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'unknown error';
  }
}

function formatMemoryEntry(opts: HeartbeatRespondOptions, now: Date): string {
  const utcLabel = now.toISOString().slice(11, 16) + ' UTC';
  let localLabel: string;
  try {
    localLabel = now.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      ...(opts.timezone ? { timeZone: opts.timezone } : {}),
    });
  } catch {
    localLabel = now.toISOString();
  }

  const parts: string[] = [];
  parts.push('');
  parts.push(`## Heartbeat Update - ${utcLabel} / ${localLabel}`);
  parts.push(`- Status: ${opts.status}`);
  if (typeof opts.inboxCount === 'number') parts.push(`- Inbox: ${opts.inboxCount}`);
  if (typeof opts.tasksCount === 'number') parts.push(`- Tasks: ${opts.tasksCount}`);
  if (opts.task) parts.push(`- Working on: ${opts.task}`);
  if (opts.next) parts.push(`- Next action: ${opts.next}`);
  if (opts.note) parts.push(`- Note: ${opts.note}`);
  parts.push('');
  return parts.join('\n');
}

/**
 * Run the four heartbeat sub-actions atomically (per step, not as a transaction).
 * Each step is wrapped in try/catch so a failure in one does not abort the rest.
 */
export function heartbeatRespond(
  paths: BusPaths,
  agentName: string,
  org: string,
  options: HeartbeatRespondOptions,
): HeartbeatRespondResult {
  const now = new Date();

  // Step 1: update heartbeat
  const heartbeat: SubstepResult = { ok: false };
  try {
    updateHeartbeat(paths, agentName, mapStatusToHeartbeatString(options.status), {
      org,
      timezone: options.timezone,
      loopInterval: options.loopInterval,
      currentTask: options.task,
      displayName: options.displayName,
    });
    heartbeat.ok = true;
  } catch (err) {
    heartbeat.error = describeError(err);
  }

  // Step 2: log structured heartbeat event
  const event: SubstepResult = { ok: false };
  try {
    const meta: Record<string, unknown> = {
      agent: agentName,
      status: options.status,
    };
    if (typeof options.inboxCount === 'number') meta.inbox_count = options.inboxCount;
    if (typeof options.tasksCount === 'number') meta.tasks_count = options.tasksCount;
    if (options.next) meta.next = options.next;
    if (options.note) meta.note = options.note;
    if (options.task) meta.task = options.task;
    logEvent(paths, agentName, org, 'heartbeat', 'agent_heartbeat', 'info', meta);
    event.ok = true;
  } catch (err) {
    event.error = describeError(err);
  }

  // Step 3: record cron fire
  const cronFire: SubstepResult = { ok: false };
  try {
    updateCronFire(paths.stateDir, options.cronName ?? 'heartbeat', options.cronInterval);
    cronFire.ok = true;
  } catch (err) {
    cronFire.error = describeError(err);
  }

  // Step 4: append to daily memory
  const memory: HeartbeatRespondResult['memory'] = { ok: false };
  if (options.skipMemory) {
    memory.ok = true;
    memory.skipped = true;
  } else {
    try {
      const dir = options.memoryDir ?? join(process.cwd(), 'memory');
      mkdirSync(dir, { recursive: true });
      const today = now.toISOString().slice(0, 10);
      const filePath = join(dir, `${today}.md`);
      appendFileSync(filePath, formatMemoryEntry(options, now), 'utf-8');
      memory.ok = true;
      memory.path = filePath;
    } catch (err) {
      memory.error = describeError(err);
    }
  }

  const allOk = heartbeat.ok && event.ok && cronFire.ok && memory.ok;

  return {
    status: options.status,
    heartbeat,
    event,
    cronFire,
    memory,
    allOk,
  };
}
