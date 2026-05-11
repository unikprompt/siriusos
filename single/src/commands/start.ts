import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { TelegramAPI } from '../telegram/api.js';
import { TelegramPoller } from '../telegram/poller.js';
import { processMediaMessage } from '../telegram/media.js';
import { AgentPTY } from '../pty/agent-pty.js';
import { appendDailyMemory } from '../memory/daily.js';
import type { AgentConfig, CtxEnv, TelegramMessage } from '../types.js';

const SINGLE_HOME = join(homedir(), '.siriusos-single');

export const startCommand = new Command('start')
  .description('Start your agent (boots Telegram poller + Claude Code PTY)')
  .argument('[agent_name]', 'Agent name (defaults to the only configured agent)')
  .action(async (agentNameArg: string | undefined) => {
    const agentName = resolveAgentName(agentNameArg);
    const agentDir = join(SINGLE_HOME, agentName);

    if (!existsSync(agentDir)) {
      console.error(chalk.red(`\nAgent "${agentName}" not found. Run 'siriusos-single init' first.\n`));
      process.exit(1);
    }

    // -- Load config + env -------------------------------------------------

    const config = readConfig(agentDir);
    const env = readEnvFile(join(agentDir, '.env'));
    const botToken = env.BOT_TOKEN;
    const chatId = env.CHAT_ID;
    const allowedUser = env.ALLOWED_USER || chatId;

    if (!botToken || !chatId) {
      console.error(chalk.red(`\nMissing BOT_TOKEN or CHAT_ID in ${agentDir}/.env. Re-run 'siriusos-single init'.\n`));
      process.exit(1);
    }

    // -- Boot Telegram -----------------------------------------------------

    const api = new TelegramAPI(botToken);
    console.log(chalk.bold.blue(`\nBooting ${agentName}...`));
    await api.sendMessage(chatId, '🤖 Booting up... one moment.', undefined, { parseMode: null }).catch(() => undefined);

    // -- Spawn Claude Code PTY ---------------------------------------------

    const ctxEnv: CtxEnv = {
      instanceId: 'single',
      ctxRoot: SINGLE_HOME,
      frameworkRoot: SINGLE_HOME,
      agentName,
      agentDir,
      org: 'single',
      projectRoot: agentDir,
      timezone: config.timezone,
    };
    const stateDir = join(agentDir, 'state');
    mkdirSync(stateDir, { recursive: true });
    const logPath = join(stateDir, 'stdout.log');

    const pty = new AgentPTY(ctxEnv, config, logPath);
    const bootPrompt = buildBootPrompt(agentName, config);
    await pty.spawn('fresh', bootPrompt);

    // -- Wire PTY output → Telegram with debounced flush -------------------

    const FLUSH_DEBOUNCE_MS = 2500;
    let pendingChunks: string[] = [];
    let flushTimer: NodeJS.Timeout | null = null;

    const flush = async () => {
      flushTimer = null;
      if (pendingChunks.length === 0) return;
      const raw = pendingChunks.join('');
      pendingChunks = [];

      const cleaned = sanitizeAgentOutput(raw);
      if (!cleaned) return;

      try {
        await api.sendMessage(chatId, cleaned, undefined, { parseMode: null });
      } catch (err) {
        console.error('[telegram] sendMessage failed:', err);
      }
      appendDailyMemory(agentDir, 'agent', cleaned);
    };

    pty.onData((chunk) => {
      pendingChunks.push(chunk);
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
    });

    pty.onExit((exitCode) => {
      console.log(chalk.yellow(`\n[pty] Claude exited (code ${exitCode}). Run 'siriusos-single start' to restart.`));
      api.sendMessage(chatId, '⚠️ Agent stopped. Restart with `siriusos-single start`.', undefined, { parseMode: null }).catch(() => undefined);
      process.exit(exitCode);
    });

    // -- Wire Telegram → PTY (with ALLOWED_USER gate + voice transcription) -

    const downloadDir = join(stateDir, 'downloads');
    const poller = new TelegramPoller(api, stateDir);

    poller.onMessage(async (msg: TelegramMessage) => {
      const senderId = msg.from?.id;
      if (allowedUser && senderId && String(senderId) !== String(allowedUser)) {
        // Silent drop — don't echo unauthorized senders
        return;
      }

      try {
        const formatted = await formatTelegramMessage(msg, api, downloadDir);
        if (!formatted) return;

        appendDailyMemory(agentDir, 'user', formatted);
        pty.write(formatted + '\n');
      } catch (err) {
        console.error('[telegram-handler]', err);
      }
    });

    // -- Boot complete ------------------------------------------------------

    setTimeout(() => {
      api.sendMessage(chatId, '✅ Online. Send me a message.', undefined, { parseMode: null }).catch(() => undefined);
    }, 5000);

    console.log(chalk.green(`\n✓ ${agentName} is running.`));
    console.log(chalk.dim(`  PTY log: ${logPath}`));
    console.log(chalk.dim('  Send Telegram messages to your bot. Ctrl+C to stop.\n'));

    // -- Graceful shutdown --------------------------------------------------

    const shutdown = (signal: string) => {
      console.log(chalk.yellow(`\n[${signal}] Shutting down...`));
      poller.stop();
      if (flushTimer) clearTimeout(flushTimer);
      pty.kill();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    await poller.start();
  });

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
    console.error(chalk.red(`\nNo agents configured in ${SINGLE_HOME}. Run 'siriusos-single init' first.\n`));
    process.exit(1);
  }
  if (entries.length > 1) {
    console.error(chalk.red(`\nMultiple agents configured: ${entries.join(', ')}. Pass an agent name: siriusos-single start <name>\n`));
    process.exit(1);
  }
  return entries[0];
}

function readConfig(agentDir: string): AgentConfig {
  const configPath = join(agentDir, 'config.json');
  if (!existsSync(configPath)) {
    return {};
  }
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

function buildBootPrompt(agentName: string, config: AgentConfig): string {
  return [
    `Eres "${agentName}", un agente persistente que conversa con tu operador a través de Telegram.`,
    '',
    `Reglas:`,
    `- Cada mensaje del usuario llega con el header "=== TELEGRAM from {nombre} ===". Tu respuesta SE ENVÍA AUTOMÁTICAMENTE como mensaje de Telegram al usuario.`,
    `- Responde en texto natural sin código de formato (no uses bloques Markdown salvo backticks para comandos). Telegram no renderiza Markdown completo.`,
    `- Sé directo y conciso. Evita preámbulos.`,
    `- Para mensajes de voz, el contenido transcrito viene en el campo "[transcript]". Trata el transcript como si fuera el mensaje del usuario.`,
    `- Tienes una carpeta local memory/ con archivos YYYY-MM-DD.md. Léelos al inicio de cada sesión para recuperar contexto.`,
    `- Tienes una carpeta local/ donde puedes guardar instrucciones custom (ej. local/CLAUDE.md) si el usuario te lo pide.`,
    '',
    `Idioma principal: ${config.language || 'es'}.`,
    config.timezone ? `Zona horaria: ${config.timezone}.` : '',
    '',
    `Empieza leyendo memory/ para tu contexto previo y luego espera el primer mensaje del usuario.`,
  ].filter(Boolean).join('\n');
}

/**
 * Format an incoming Telegram message into the standard inject string the
 * agent reads. For voice/audio, downloads the media and (if whisper-cli
 * is available) inlines the transcript.
 */
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

/**
 * Clean Claude PTY output for Telegram delivery:
 *  - Strip ANSI escape sequences (cursor moves, colors, etc.)
 *  - Strip Claude Code TUI chrome (boxes drawn with │ ─ ╭ ╮, footer hints)
 *  - Collapse runs of blank lines
 *  - Trim leading/trailing whitespace
 *
 * If nothing remains after cleanup, returns empty string so the debounced
 * flusher skips sending an empty Telegram message.
 */
function sanitizeAgentOutput(raw: string): string {
  let text = stripAnsi(raw);

  // Drop UI box-drawing lines (Claude's TUI prompt frame)
  text = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      // Claude TUI uses Unicode box chars; drop lines that are mostly box chars
      const boxRatio = (trimmed.match(/[│─╭╮╯╰┌┐└┘├┤┬┴┼]/g) || []).length / trimmed.length;
      if (boxRatio > 0.3) return false;
      // Drop common Claude Code footer hints
      if (/^\s*(>\s+Try|↑\/↓ history|esc to clear|ctrl\+[a-z])/i.test(trimmed)) return false;
      return true;
    })
    .join('\n');

  // Collapse 3+ blank lines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
