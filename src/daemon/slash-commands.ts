/**
 * Daemon-side Telegram slash command handler.
 *
 * Some slash commands the user types in the agent's Telegram chat are
 * meaningful to the DAEMON, not the agent — e.g. "restart this agent"
 * makes no sense to inject into the agent's prompt because the agent
 * cannot kill its own process and respawn cleanly. Other slash commands
 * (e.g. `/commit`, `/help`) belong to the agent (Claude Code's built-in
 * skills) and must pass through untouched.
 *
 * This module sits between Telegram inbound and the FastChecker queue:
 * it inspects the raw text, dispatches a registered command if it
 * matches, and otherwise tells the caller to forward the message
 * unchanged. For commands that need to involve the agent (like /plan),
 * it returns a `transformedText` so the caller queues a rewritten
 * message instead of the literal slash command.
 *
 * Registered daemon commands (intercept and consume):
 *   /clear   — hard-restart the agent (fresh session, no --continue)
 *   /restart — self-restart the agent (preserves conversation history)
 *   /status  — read heartbeat + current task, reply via Telegram
 *
 * Registered transform commands (intercept and rewrite):
 *   /plan    — replace with "Entra en planning mode (EnterPlanMode)…"
 *              optionally appended with the user's text after /plan
 *
 * Anything else starting with `/` falls through (agent-owned).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface HeartbeatSnapshot {
  status?: string;
  current_task?: string;
  last_heartbeat?: string;
  mode?: string;
  uptime_seconds?: number;
  loop_interval?: number;
}

export interface SlashCommandDeps {
  agentName: string;
  chatId: string | number;
  ctxRoot: string;
  log: (msg: string) => void;
  /** Spawns daemon-side restart (stop+start). */
  restartAgent: (name: string) => Promise<void>;
  /** Direct Telegram reply (bypasses agent queue). */
  sendTelegram: (chatId: string | number, text: string) => Promise<unknown>;
  /**
   * Optional override for heartbeat read (test-only). Defaults to reading
   * `${ctxRoot}/state/${agentName}/heartbeat.json`.
   */
  readHeartbeat?: (ctxRoot: string, agentName: string) => HeartbeatSnapshot | null;
}

export interface SlashCommandResult {
  /** true when the command was handled and the original message must NOT be queued. */
  handled: boolean;
  /**
   * When provided AND `handled === false`, the caller must queue this string
   * instead of the original text. Used by /plan to inject a planning prompt.
   */
  transformedText?: string;
}

/** Default heartbeat file reader. Returns null if file missing or unparseable. */
function defaultReadHeartbeat(ctxRoot: string, agentName: string): HeartbeatSnapshot | null {
  const path = join(ctxRoot, 'state', agentName, 'heartbeat.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as HeartbeatSnapshot;
  } catch {
    return null;
  }
}

/** Write a state-dir marker file; missing dir is created. Best-effort, never throws. */
function writeMarker(
  ctxRoot: string,
  agentName: string,
  filename: string,
  body: string,
  log: (msg: string) => void,
): void {
  try {
    const stateDir = join(ctxRoot, 'state', agentName);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, filename), body, 'utf-8');
  } catch (err) {
    log(`slash-commands: failed to write ${filename}: ${(err as Error).message}`);
  }
}

/** Format a heartbeat snapshot for /status replies. */
function formatStatusReply(agentName: string, hb: HeartbeatSnapshot | null): string {
  if (!hb) {
    return `Agent ${agentName}: no heartbeat on disk yet — agent may not have completed first bootstrap.`;
  }
  const parts: string[] = [`Agent ${agentName}:`];
  if (hb.status) parts.push(`status=${hb.status}`);
  if (hb.mode) parts.push(`mode=${hb.mode}`);
  if (hb.last_heartbeat) parts.push(`last_heartbeat=${hb.last_heartbeat}`);
  if (hb.current_task) parts.push(`task="${hb.current_task}"`);
  if (typeof hb.uptime_seconds === 'number') {
    const mins = Math.round(hb.uptime_seconds / 60);
    parts.push(`uptime=${mins}min`);
  }
  return parts.join(' · ');
}

const PLAN_INJECTION = 'Entra en planning mode (EnterPlanMode). Planifica tu respuesta antes de ejecutar cualquier accion.';

/**
 * Inspect a Telegram text payload and dispatch matching daemon-side slash
 * commands. Returns `{ handled }` (and optional `transformedText`) so the
 * caller can decide whether to queue the original message, queue a
 * rewritten one, or skip it entirely.
 */
export async function handleSlashCommand(
  rawText: string,
  deps: SlashCommandDeps,
): Promise<SlashCommandResult> {
  const text = rawText.trimStart();
  if (!text.startsWith('/')) return { handled: false };

  // Split into command + remainder. Telegram allows "@botname" suffix on
  // command (e.g. "/status@my_bot") in group chats — strip that too.
  const firstWs = text.search(/\s/);
  const head = firstWs === -1 ? text : text.slice(0, firstWs);
  const remainder = firstWs === -1 ? '' : text.slice(firstWs + 1).trim();
  const command = head.split('@')[0].toLowerCase();

  switch (command) {
    case '/clear':
      deps.log(`slash: /clear → hard-restart ${deps.agentName}`);
      writeMarker(deps.ctxRoot, deps.agentName, '.force-fresh', `user requested via /clear: ${remainder || 'no reason'}`, deps.log);
      writeMarker(deps.ctxRoot, deps.agentName, '.restart-planned', `user /clear: ${remainder || 'fresh session'}`, deps.log);
      void deps.sendTelegram(deps.chatId, `Reiniciando ${deps.agentName} con sesión fresca (sin --continue)…`)
        .catch((err) => deps.log(`slash: telegram reply failed: ${(err as Error).message}`));
      // Fire-and-forget: restart returns when the agent re-spawns. We don't
      // block the inbound Telegram poller on it.
      void deps.restartAgent(deps.agentName).catch((err) =>
        deps.log(`slash: /clear restart failed: ${(err as Error).message}`),
      );
      return { handled: true };

    case '/restart':
      deps.log(`slash: /restart → self-restart ${deps.agentName} (preserve history)`);
      writeMarker(deps.ctxRoot, deps.agentName, '.user-restart', `user requested via /restart: ${remainder || 'no reason'}`, deps.log);
      void deps.sendTelegram(deps.chatId, `Reiniciando ${deps.agentName} preservando historia (--continue)…`)
        .catch((err) => deps.log(`slash: telegram reply failed: ${(err as Error).message}`));
      void deps.restartAgent(deps.agentName).catch((err) =>
        deps.log(`slash: /restart failed: ${(err as Error).message}`),
      );
      return { handled: true };

    case '/status': {
      deps.log(`slash: /status ${deps.agentName}`);
      const reader = deps.readHeartbeat ?? defaultReadHeartbeat;
      const hb = reader(deps.ctxRoot, deps.agentName);
      const reply = formatStatusReply(deps.agentName, hb);
      void deps.sendTelegram(deps.chatId, reply)
        .catch((err) => deps.log(`slash: /status reply failed: ${(err as Error).message}`));
      return { handled: true };
    }

    case '/plan': {
      deps.log(`slash: /plan → inject planning prompt for ${deps.agentName}`);
      const transformedText = remainder.length > 0
        ? `${PLAN_INJECTION}\n\n${remainder}`
        : PLAN_INJECTION;
      // Don't consume the message — let the caller queue the transformed text
      // so the agent's normal Telegram-message handling (with reply context,
      // history, etc.) still runs.
      return { handled: false, transformedText };
    }

    default:
      // Unknown slash: pass through. Claude Code's built-in commands like
      // /commit, /compact, /clear-conversation, etc. are agent-side and the
      // agent must see them.
      return { handled: false };
  }
}
