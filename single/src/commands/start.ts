import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { TelegramAPI } from '../telegram/api.js';
import { TelegramPoller } from '../telegram/poller.js';
import { processMediaMessage } from '../telegram/media.js';
import { appendDailyMemory } from '../memory/daily.js';
import type { AgentConfig, TelegramMessage } from '../types.js';

const SINGLE_HOME = join(homedir(), '.siriusos-single');

/**
 * Run the agent in headless / one-shot mode per Telegram message:
 *
 *   user msg → spawn `claude -p [--continue] -p "<msg>"` → capture stdout → send to Telegram
 *
 * Why this design (vs. a persistent PTY):
 *  - `claude -p` is non-interactive: no TUI banner, no trust-folder prompt,
 *    no welcome screen, no status spinners, no input echo. Stdout is just
 *    the assistant's reply text. Perfect for piping to Telegram.
 *  - Session continuity comes from Claude Code's `--continue` flag, which
 *    auto-resumes the most recent conversation in the current cwd. We mark
 *    the first message with a sentinel file so it spawns WITHOUT --continue
 *    (nothing to resume yet); all subsequent messages carry --continue.
 *  - The trade-off is ~2-3s of process spin-up per message, which is fine
 *    for a chat-pace workload. The trade-off the OTHER way (TUI parsing)
 *    is unbounded brittleness as Claude Code's UI evolves.
 */

export const startCommand = new Command('start')
  .description('Start your agent (Telegram poller + headless Claude per message)')
  .argument('[agent_name]', 'Agent name (defaults to the only configured agent)')
  .action(async (agentNameArg: string | undefined) => {
    const agentName = resolveAgentName(agentNameArg);
    const agentDir = join(SINGLE_HOME, agentName);

    if (!existsSync(agentDir)) {
      console.error(chalk.red(`\nAgent "${agentName}" not found. Run 'siriusos-single init' first.\n`));
      process.exit(1);
    }

    const config = readConfig(agentDir);
    const env = readEnvFile(join(agentDir, '.env'));
    const botToken = env.BOT_TOKEN;
    const chatId = env.CHAT_ID;
    const allowedUser = env.ALLOWED_USER || chatId;

    if (!botToken || !chatId) {
      console.error(chalk.red(`\nMissing BOT_TOKEN or CHAT_ID in ${agentDir}/.env.\n`));
      process.exit(1);
    }

    const api = new TelegramAPI(botToken);
    console.log(chalk.bold.blue(`\nBooting ${agentName}...`));
    await api.sendMessage(chatId, '🤖 Booting up...', undefined, { parseMode: null }).catch(() => undefined);

    // -- State directories --------------------------------------------------

    const stateDir = join(agentDir, 'state');
    mkdirSync(stateDir, { recursive: true });
    const downloadDir = join(stateDir, 'downloads');
    const sessionMarker = join(stateDir, '.session-started');

    // -- Telegram poller ---------------------------------------------------

    const poller = new TelegramPoller(api, stateDir);
    let inflight = 0;

    poller.onMessage(async (msg: TelegramMessage) => {
      const senderId = msg.from?.id;
      if (allowedUser && senderId && String(senderId) !== String(allowedUser)) {
        return;
      }

      inflight++;
      try {
        const userPrompt = await formatTelegramMessage(msg, api, downloadDir);
        if (!userPrompt) return;

        appendDailyMemory(agentDir, 'user', userPrompt);

        const isFirstRun = !existsSync(sessionMarker);
        const reply = await runClaude(userPrompt, {
          agentDir,
          agentName,
          model: config.model || 'claude-sonnet-4-6',
          language: config.language || 'es',
          timezone: config.timezone,
          continueSession: !isFirstRun,
        });

        if (isFirstRun) {
          writeFileSync(sessionMarker, new Date().toISOString());
        }

        if (reply) {
          await api.sendMessage(chatId, reply, undefined, { parseMode: null }).catch((err) => {
            console.error('[telegram] sendMessage failed:', err);
          });
          appendDailyMemory(agentDir, 'agent', reply);
        } else {
          await api.sendMessage(chatId, '(silencio — el agente no produjo respuesta)', undefined, { parseMode: null }).catch(() => undefined);
        }
      } catch (err) {
        console.error('[telegram-handler]', err);
        await api.sendMessage(chatId, `⚠️ Error: ${err instanceof Error ? err.message : err}`, undefined, { parseMode: null }).catch(() => undefined);
      } finally {
        inflight--;
      }
    });

    // -- Boot complete -----------------------------------------------------

    await api.sendMessage(chatId, '✅ Online. Mándame un mensaje.', undefined, { parseMode: null }).catch(() => undefined);
    console.log(chalk.green(`\n✓ ${agentName} is running.`));
    console.log(chalk.dim(`  Agent dir: ${agentDir}`));
    console.log(chalk.dim('  Send Telegram messages to your bot. Ctrl+C to stop.\n'));

    // -- Graceful shutdown -------------------------------------------------

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(chalk.yellow(`\n[${signal}] Shutting down...`));
      poller.stop();
      if (inflight > 0) {
        console.log(chalk.dim(`  Waiting for ${inflight} in-flight message(s)...`));
        // Give in-flight messages up to 30s to finish
        const deadline = Date.now() + 30_000;
        while (inflight > 0 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    await poller.start();
  });

// ---------------------------------------------------------------------------
// Claude invocation
// ---------------------------------------------------------------------------

interface RunClaudeOptions {
  agentDir: string;
  agentName: string;
  model: string;
  language: string;
  timezone?: string;
  continueSession: boolean;
}

/**
 * Spawn `claude -p` and collect its stdout. Returns the assistant's reply
 * as a trimmed string, or null if the process exited non-zero or produced
 * no output.
 *
 * Timeout: 5 minutes. Stderr is captured for diagnostics but not sent to
 * Telegram (would leak internal errors to the user).
 */
function runClaude(userMessage: string, opts: RunClaudeOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--model', opts.model,
      '--append-system-prompt', buildSystemPrompt(opts),
      ...(opts.continueSession ? ['--continue'] : []),
      userMessage,
    ];

    const proc = spawn('claude', args, {
      cwd: opts.agentDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      console.error('[claude] timeout — killing process');
      proc.kill('SIGTERM');
    }, 5 * 60 * 1000);

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error(`[claude] exit ${code}`);
        if (stderr) console.error(`[claude stderr] ${stderr.slice(0, 500)}`);
        // Still try to return stdout if we got any — claude sometimes exits
        // non-zero for non-fatal warnings.
        const fallback = stdout.trim();
        resolve(fallback || null);
        return;
      }
      resolve(stdout.trim() || null);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[claude] spawn error:', err);
      resolve(null);
    });
  });
}

function buildSystemPrompt(opts: RunClaudeOptions): string {
  return [
    `Eres "${opts.agentName}", un agente conversacional al que un operador escribe a través de Telegram.`,
    '',
    `Reglas:`,
    `- El input incluye un header "=== TELEGRAM from {nombre} (chat_id:{id}) ===". El cuerpo es el mensaje del usuario.`,
    `- Tu respuesta se envía AUTOMÁTICAMENTE como mensaje de Telegram. NO uses bloques de código Markdown ni formato pesado — Telegram no renderiza Markdown completo. Texto natural; solo backticks para comandos cortos.`,
    `- Sé directo y conciso. Sin preámbulos del tipo "Claro,..." o "Voy a...". Responde al grano.`,
    `- Para audios, el contenido transcrito viene marcado con "[transcript]:". Trátalo como si fuera el mensaje del usuario.`,
    `- En este directorio (${opts.agentDir}) tienes una carpeta memory/ con archivos YYYY-MM-DD.md de conversaciones previas. Léelos si necesitas recuperar contexto. También hay una carpeta local/ donde el usuario puede añadir instrucciones custom (lee local/CLAUDE.md si existe).`,
    '',
    `Idioma principal: ${opts.language}.`,
    opts.timezone ? `Zona horaria: ${opts.timezone}.` : '',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAgentName(arg: string | undefined): string {
  if (arg) return arg;
  if (!existsSync(SINGLE_HOME)) {
    console.error(chalk.red(`\nNo agents configured. Run 'siriusos-single init' first.\n`));
    process.exit(1);
  }
  const { readdirSync } = require('fs') as typeof import('fs');
  const entries = readdirSync(SINGLE_HOME, { withFileTypes: true })
    .filter((d: any) => d.isDirectory())
    .map((d: any) => d.name);
  if (entries.length === 0) {
    console.error(chalk.red(`\nNo agents configured.\n`));
    process.exit(1);
  }
  if (entries.length > 1) {
    console.error(chalk.red(`\nMultiple agents: ${entries.join(', ')}. Pass an agent name: siriusos-single start <name>\n`));
    process.exit(1);
  }
  return entries[0];
}

function readConfig(agentDir: string): AgentConfig {
  const configPath = join(agentDir, 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function readEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    out[key] = val;
  }
  return out;
}

async function formatTelegramMessage(
  msg: TelegramMessage,
  api: TelegramAPI,
  downloadDir: string,
): Promise<string | null> {
  const from = msg.from?.first_name || 'user';
  const chatId = msg.chat.id;
  const text = msg.text || msg.caption || '';

  const hasMedia = !!(msg.photo || msg.document || msg.voice || msg.audio || msg.video || msg.video_note);
  if (hasMedia) {
    const media = await processMediaMessage(msg, api, downloadDir);
    if (media) {
      const lines: string[] = [
        `=== TELEGRAM from ${from} (chat_id:${chatId}) ===`,
        `[${media.type}]`,
      ];
      if (media.transcript) lines.push(`[transcript]: ${media.transcript}`);
      if (media.text) lines.push(media.text);
      if (media.file_path) lines.push(`local_file: ${media.file_path}`);
      if (media.image_path) lines.push(`local_image: ${media.image_path}`);
      return lines.join('\n');
    }
  }

  if (!text) return null;

  return [
    `=== TELEGRAM from ${from} (chat_id:${chatId}) ===`,
    text,
  ].join('\n');
}
