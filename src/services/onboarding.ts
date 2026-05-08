/**
 * Onboarding service — pure helpers shared by the CLI setup wizard
 * (`siriusos setup`) and the visual wizard exposed to the dashboard
 * (POST /api/onboarding). Anything interactive (readline prompts,
 * stdin loops, retry UX) stays in the CLI; this module is side-effect
 * free where possible and otherwise only touches the local filesystem
 * or the Telegram API.
 */
import { existsSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { TelegramAPI, type ValidateCredentialsResult } from '../telegram/api.js';

const NAME_PATTERN = /^[a-z0-9_-]+$/;

export function validateOrgName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export function validateAgentName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/**
 * Write BOT_TOKEN + CHAT_ID to <agentDir>/.env with mode 0o600.
 * Throws if the directory does not exist.
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
 * Probe the Telegram API for the most recent chat ID seen by a bot.
 * Spawns a short-lived subprocess to keep this synchronous and avoid
 * pulling fetch into modules that don't already use it. Returns the
 * raw chat ID if the response carried one, or empty string.
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

/**
 * Non-interactive credential validation. Wraps TelegramAPI.validateCredentials
 * so the API endpoint and the CLI wizard share the same probe semantics.
 * The CLI layers its own retry/UX on top.
 */
export async function validateTelegramCreds(
  botToken: string,
  chatId: string,
): Promise<ValidateCredentialsResult> {
  const api = new TelegramAPI(botToken);
  return api.validateCredentials(chatId);
}

/**
 * Resolve the SiriusOS project root (the directory that contains
 * dist/cli.js and templates/). Honors CTX_FRAMEWORK_ROOT when set.
 * Walks up from cwd as a last resort so the helper works whether
 * the binary is invoked via npm link, global install, or local clone.
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { name } = JSON.parse(require('fs').readFileSync(pkg, 'utf-8'));
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
