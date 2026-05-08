/**
 * Onboarding helpers for the dashboard's /api/onboarding/* routes.
 *
 * Mirrors src/services/onboarding.ts in the SiriusOS root but lives inside
 * the dashboard package so Turbopack can bundle the API routes without
 * crossing the package.json boundary (the root is "type": "commonjs" while
 * Next compiles ESM, which makes the cross-import fail at build time).
 *
 * The CLI keeps using the root version. Both paths drive the same Telegram
 * REST endpoints (getMe / getChat) so behaviour stays consistent.
 */
import { existsSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const NAME_PATTERN = /^[a-z0-9_-]+$/;

export function validateOrgName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export function validateAgentName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/**
 * Write BOT_TOKEN + CHAT_ID to <agentDir>/.env with mode 0o600.
 */
export function writeAgentEnv(agentDir: string, botToken: string, chatId: string): void {
  const envPath = join(agentDir, '.env');
  const content = `BOT_TOKEN=${botToken}\nCHAT_ID=${chatId}\n`;
  writeFileSync(envPath, content, 'utf-8');
  try {
    chmodSync(envPath, 0o600);
  } catch {
    /* ignore on Windows */
  }
}

/**
 * Probe getUpdates for the latest chat id this bot has seen.
 * Returns empty string on miss or any error.
 */
export function fetchChatId(botToken: string): string {
  const script = [
    `fetch('https://api.telegram.org/bot' + process.argv[1] + '/getUpdates')`,
    `.then(r => r.json())`,
    `.then(d => { const m = d.result?.slice(-1)[0]?.message; console.log(m?.chat?.id || ''); })`,
    `.catch(() => console.log(''))`,
  ].join('');
  const result = spawnSync(process.execPath, ['-e', script, botToken], {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 10000,
  });
  const id = result.stdout?.trim() ?? '';
  return /^\d+$/.test(id) ? id : '';
}

export type ValidateCredentialsResult =
  | {
      ok: true;
      botUsername: string;
      botId: number;
      chatType: string;
      chatTitle?: string;
    }
  | {
      ok: false;
      reason: 'bad_token' | 'chat_not_found' | 'bot_recipient' | 'self_chat' | 'network_error' | 'rate_limited';
      detail: string;
    };

interface TelegramApiSuccess<T> { ok: true; result: T }
interface TelegramApiError { ok: false; error_code?: number; description?: string }
type TelegramApiResponse<T> = TelegramApiSuccess<T> | TelegramApiError;

interface TelegramUser { id: number; is_bot: boolean; username?: string; first_name?: string }
interface TelegramChat { id: number; type: string; title?: string; first_name?: string; username?: string; is_bot?: boolean }

const TIMEOUT_MS = 10_000;

async function tgPost<T>(token: string, method: string, body: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return (await res.json()) as TelegramApiResponse<T>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same probe semantics as src/telegram/api.ts validateCredentials():
 * getMe (token check) → self_chat check → getChat (chat reachability).
 */
export async function validateTelegramCreds(
  botToken: string,
  chatId: string,
): Promise<ValidateCredentialsResult> {
  const chatIdStr = String(chatId).trim();
  if (!chatIdStr) {
    return { ok: false, reason: 'chat_not_found', detail: '(empty)' };
  }

  let me: TelegramApiResponse<TelegramUser>;
  try {
    me = await tgPost<TelegramUser>(botToken, 'getMe', {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'network_error', detail: msg };
  }

  if (!me.ok) {
    const code = me.error_code ?? 0;
    const description = me.description ?? 'unknown';
    if (code === 401) return { ok: false, reason: 'bad_token', detail: description };
    if (code === 429) return { ok: false, reason: 'rate_limited', detail: description };
    return { ok: false, reason: 'bad_token', detail: description };
  }

  const botId = me.result.id;
  const botUsername = me.result.username ?? '(unknown)';

  if (String(botId) === chatIdStr) {
    return { ok: false, reason: 'self_chat', detail: chatIdStr };
  }

  let chat: TelegramApiResponse<TelegramChat>;
  try {
    chat = await tgPost<TelegramChat>(botToken, 'getChat', { chat_id: chatIdStr });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'network_error', detail: msg };
  }

  if (!chat.ok) {
    const code = chat.error_code ?? 0;
    const description = chat.description ?? 'unknown';
    if (code === 429) return { ok: false, reason: 'rate_limited', detail: description };
    if (code === 403 || /bots can.?t send messages to bots|Forbidden/i.test(description)) {
      return { ok: false, reason: 'bot_recipient', detail: chatIdStr };
    }
    return { ok: false, reason: 'chat_not_found', detail: chatIdStr };
  }

  const chatType = chat.result.type ?? '(unknown)';
  const chatIsBot = chatType === 'private' && chat.result.is_bot === true;
  const chatTitle = chat.result.title ?? chat.result.first_name ?? chat.result.username;

  if (chatIsBot) {
    return { ok: false, reason: 'bot_recipient', detail: chatIdStr };
  }

  return { ok: true, botUsername, botId, chatType, chatTitle };
}

/**
 * Resolve the SiriusOS project root. The dashboard is started from inside
 * the SiriusOS install dir (siriusos dashboard --build), so the parent of
 * dashboard/ is our root in 99% of cases.
 */
export function findProjectRoot(): string {
  if (process.env.CTX_FRAMEWORK_ROOT && existsSync(join(process.env.CTX_FRAMEWORK_ROOT, 'dist', 'cli.js'))) {
    return process.env.CTX_FRAMEWORK_ROOT;
  }
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'dist', 'cli.js'))) return cwd;
  let dir = cwd;
  for (let i = 0; i < 4; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const fs = require('fs') as typeof import('fs');
        const { name } = JSON.parse(fs.readFileSync(pkg, 'utf-8'));
        if (name === 'siriusos' && existsSync(join(dir, 'dist', 'cli.js'))) return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}
