/**
 * crons-schema.ts — Path constants and helpers for the external persistent cron system.
 *
 * Subtask 1.1 (schema design).  Intentionally thin: only constants and a path
 * joiner.  Read/write operations live in Subtask 1.2 (src/bus/crons.ts).
 *
 * Per-agent crons.json location, relative to CTX_ROOT:
 *   {CRONS_DIRECTORY}/{agentName}/{CRONS_FILENAME}
 *   => state/agents/boris/crons.json
 *
 * Resolved against ~/.siriusos/<instance>:
 *   ~/.siriusos/default/state/agents/boris/crons.json
 */

import { join } from 'path';

/**
 * Root directory that holds per-agent cron state sub-directories.
 * Relative to CTX_ROOT; callers that need an absolute path should
 * prefix with the CTX_ROOT env var or the framework root from CtxEnv.
 *
 * Historical note: this used to read ".siriusos/state/agents" (a leftover
 * from when the relative path was concatenated with CTX_ROOT, which itself
 * already ended in ".siriusos/<instance>"). The doubled prefix produced
 * paths like ~/.siriusos/default/.siriusos/state/agents/<agent>/crons.json.
 * Fixed in commit "fix(cli): de-double cron path"; runtime now stores cron
 * state at ~/.siriusos/<instance>/state/agents/<agent>/.
 *
 * @example "state/agents"
 */
export const CRONS_DIRECTORY = 'state/agents';

/**
 * File name for the cron definitions list inside each agent state directory.
 *
 * @example "crons.json"
 */
export const CRONS_FILENAME = 'crons.json';

/**
 * Return the path to an agent's crons.json relative to CTX_ROOT.
 *
 * @param agentName - The agent's directory name (e.g. "boris", "paul").
 * @returns Relative path string: `state/agents/{agentName}/crons.json`
 *
 * @example
 * cronsPathFor("boris")
 * // => "state/agents/boris/crons.json"
 */
export function cronsPathFor(agentName: string): string {
  return join(CRONS_DIRECTORY, agentName, CRONS_FILENAME);
}

/**
 * File name for the per-agent cron execution log (JSONL format).
 *
 * @example "cron-execution.log"
 */
export const CRON_EXECUTION_LOG_FILENAME = 'cron-execution.log';

/**
 * Return the path to an agent's cron execution log relative to CTX_ROOT.
 *
 * The log is JSONL: one CronExecutionLogEntry JSON object per line.
 * It is append-only; rotation prunes to the last 1 000 lines.
 *
 * @param agentName - The agent's directory name (e.g. "boris", "paul").
 * @returns Relative path string:
 *   `state/agents/{agentName}/cron-execution.log`
 *
 * @example
 * cronExecutionLogPathFor("boris")
 * // => "state/agents/boris/cron-execution.log"
 */
export function cronExecutionLogPathFor(agentName: string): string {
  return join(CRONS_DIRECTORY, agentName, CRON_EXECUTION_LOG_FILENAME);
}
