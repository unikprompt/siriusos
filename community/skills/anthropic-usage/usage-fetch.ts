#!/usr/bin/env tsx
/**
 * usage-fetch.ts — lee el % real de uso de un plan Anthropic consumer
 * (Pro / Max 5x / Max 20x) desde el endpoint interno de claude.ai
 * y escribe el resultado a un JSON que Sentinel u otro agente consume.
 *
 * Reemplaza la heurística de ccusage que infla 5-10x sumando
 * cache_read_input_tokens (Anthropic no los cuenta contra el rate limit).
 *
 * Spec completa en SKILL.md (mismo directorio).
 *
 * Variables de entorno requeridas:
 *   ANTHROPIC_USAGE_SESSION_KEY  cookie sessionKey de claude.ai (sk-ant-sid01-...)
 *   ANTHROPIC_USAGE_ORG_ID       uuid del organization (se obtiene con --discover-org)
 *   ANTHROPIC_USAGE_CHAT_ID      chat_id de Telegram para alertas 401
 *   BOT_TOKEN                    token del bot de Telegram del agente
 *
 * Variables opcionales (inyectadas por el daemon siriusos):
 *   CTX_ROOT                     base del state dir, ej ~/.siriusos/default
 *   CTX_AGENT_NAME               nombre del agente (ej "sentinel"), para path default
 *
 * Exit codes:
 *   0 ok        fetch exitoso, JSON con status:"ok"
 *   1 expired   401/403, JSON con status:"expired" + Telegram enviado
 *   2 stale     429 o network timeout, JSON con status:"stale"
 *   3 error     JSON malformado u otro error inesperado
 *   4 setup     falta env var o argumento inválido
 */

import { writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const ENDPOINT_BASE = 'https://claude.ai/api';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15_000;

// ---------- argparse ----------

interface Args {
  mode: 'once' | 'discover-org';
  outputPath?: string;
  noTelegram: boolean;
  debugRaw: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'once', noTelegram: false, debugRaw: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.mode = 'once';
    else if (a === '--discover-org') args.mode = 'discover-org';
    else if (a === '--output') args.outputPath = argv[++i];
    else if (a === '--no-telegram') args.noTelegram = true;
    else if (a === '--debug-raw') args.debugRaw = true;
    else if (a === '-h' || a === '--help') args.help = true;
  }
  return args;
}

function printHelp(): void {
  process.stderr.write(`usage-fetch — lee el rate-limit real de Anthropic desde claude.ai.

Uso:
  tsx usage-fetch.ts [--once|--discover-org] [--output PATH] [--no-telegram]

Modos:
  --once            (default) fetch + escribe JSON con el shape de SKILL.md.
  --discover-org    imprime el org_id a stdout y sale. Para setup inicial.

Opciones:
  --output PATH     override del output. Default:
                    \${CTX_ROOT}/state/\${CTX_AGENT_NAME}/anthropic_usage.json
                    o ~/.siriusos/default/state/sentinel/anthropic_usage.json.
  --no-telegram     no manda alerta en 401/403. Para debug.
  --debug-raw       imprime el body crudo del response a stderr antes de
                    parsear. Útil cuando los campos vienen null para ver
                    el shape real del JSON que devuelve la API.

Env requerido: ANTHROPIC_USAGE_SESSION_KEY, ANTHROPIC_USAGE_ORG_ID
              (ANTHROPIC_USAGE_CHAT_ID + BOT_TOKEN si querés alertas).

Exit codes: 0 ok, 1 expired, 2 stale, 3 error, 4 setup.
`);
}

// ---------- env + paths ----------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`usage-fetch: falta env var ${name}\n`);
    process.exit(4);
  }
  return v;
}

function defaultOutputPath(): string {
  const root = process.env.CTX_ROOT || join(homedir(), '.siriusos', 'default');
  const agent = process.env.CTX_AGENT_NAME || 'sentinel';
  return join(root, 'state', agent, 'anthropic_usage.json');
}

// ---------- HTTP ----------

interface ClaudeApiResponse {
  five_hour?: { utilization_pct?: number; reset_at?: string };
  seven_day?: { utilization_pct?: number; reset_at?: string };
  seven_day_opus?: { utilization_pct?: number; reset_at?: string };
}

interface Organization {
  uuid: string;
  name?: string;
  capabilities?: string[];
}

async function httpGet(
  url: string,
  sessionKey: string,
): Promise<{ status: number; bodyText: string; bodyJson: unknown | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: `sessionKey=${sessionKey}`,
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/plain, */*',
        'anthropic-client-platform': 'web_claude_ai',
      },
      signal: controller.signal,
    });
    const bodyText = await res.text();
    let bodyJson: unknown | null = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }
    return { status: res.status, bodyText, bodyJson };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverOrg(sessionKey: string): Promise<string> {
  const { status, bodyText, bodyJson } = await httpGet(
    `${ENDPOINT_BASE}/organizations`,
    sessionKey,
  );
  if (status !== 200) {
    process.stderr.write(`discover-org: HTTP ${status} — ${bodyText.slice(0, 200)}\n`);
    process.exit(status === 401 || status === 403 ? 1 : 3);
  }
  if (!Array.isArray(bodyJson) || bodyJson.length === 0) {
    process.stderr.write('discover-org: respuesta no es array o está vacía\n');
    process.exit(3);
  }
  const orgs = bodyJson as Organization[];
  const claudeOrg = orgs.find(
    (o) => o.capabilities?.some((c) => c.includes('claude_pro') || c.includes('claude_max') || c.includes('raven')),
  ) ?? orgs[0];
  if (!claudeOrg?.uuid) {
    process.stderr.write('discover-org: ningún org tiene uuid\n');
    process.exit(3);
  }
  return claudeOrg.uuid;
}

// ---------- parsing ----------

interface OutputJson {
  status: 'ok' | 'stale' | 'expired' | 'error';
  session_pct: number | null;
  weekly_pct: number | null;
  weekly_pct_opus: number | null;
  session_resets_in_min: number | null;
  session_resets_at_utc: string | null;
  weekly_resets_day: string | null;
  weekly_resets_at_utc: string | null;
  fetched_at: string;
  error_message?: string;
}

function parseResponse(json: ClaudeApiResponse, fetchedAt: string): OutputJson {
  const sessionPct = json.five_hour?.utilization_pct ?? null;
  const weeklyPct = json.seven_day?.utilization_pct ?? null;
  const weeklyPctOpus = json.seven_day_opus?.utilization_pct ?? null;
  const sessionResetAt = json.five_hour?.reset_at ?? null;
  const weeklyResetAt = json.seven_day?.reset_at ?? null;

  const sessionResetsInMin = sessionResetAt
    ? Math.max(0, Math.round((Date.parse(sessionResetAt) - Date.parse(fetchedAt)) / 60_000))
    : null;

  const weeklyResetsDay = weeklyResetAt
    ? new Date(weeklyResetAt).toLocaleDateString('es', { weekday: 'long', timeZone: 'America/New_York' })
    : null;

  return {
    status: 'ok',
    session_pct: sessionPct,
    weekly_pct: weeklyPct,
    weekly_pct_opus: weeklyPctOpus,
    session_resets_in_min: sessionResetsInMin,
    session_resets_at_utc: sessionResetAt,
    weekly_resets_day: weeklyResetsDay,
    weekly_resets_at_utc: weeklyResetAt,
    fetched_at: fetchedAt,
  };
}

// ---------- output (atomic write) ----------

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

function writeOutput(out: OutputJson, path: string): void {
  writeAtomic(path, JSON.stringify(out, null, 2) + '\n');
}

// ---------- telegram (alerta de cookie expirada) ----------

async function notifyTelegram(text: string): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  const chatId = process.env.ANTHROPIC_USAGE_CHAT_ID;
  if (!botToken || !chatId) {
    process.stderr.write(
      'usage-fetch: BOT_TOKEN o ANTHROPIC_USAGE_CHAT_ID no configurados; skip Telegram\n',
    );
    return;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal,
    });
  } catch (e) {
    process.stderr.write(
      `usage-fetch: Telegram falló silenciosamente: ${(e as Error).message}\n`,
    );
  } finally {
    clearTimeout(timer);
  }
}

const EXPIRED_TELEGRAM_MSG = [
  '🔑 anthropic-usage: sessionKey de claude.ai expiró.',
  '',
  'Renovar:',
  '1. Abrir https://claude.ai con sesión activa',
  '2. DevTools (F12) → Application → Cookies → claude.ai → copiar `sessionKey`',
  '3. Editar el .env del agente: ANTHROPIC_USAGE_SESSION_KEY=...',
  '4. siriusos restart <agente>',
  '',
  'Mientras tanto: Sentinel cae al fallback de ccusage.',
].join('\n');

// ---------- main ----------

async function modeDiscoverOrg(sessionKey: string): Promise<void> {
  const orgId = await discoverOrg(sessionKey);
  process.stdout.write(`org_id=${orgId}\n`);
  process.exit(0);
}

async function modeOnce(args: Args, sessionKey: string): Promise<void> {
  const orgId = requireEnv('ANTHROPIC_USAGE_ORG_ID');
  const outputPath = args.outputPath ?? defaultOutputPath();
  const fetchedAt = new Date().toISOString();

  let httpResult: Awaited<ReturnType<typeof httpGet>>;
  try {
    httpResult = await httpGet(`${ENDPOINT_BASE}/organizations/${orgId}/usage`, sessionKey);
  } catch (e) {
    // Network error / timeout → stale
    const out: OutputJson = {
      status: 'stale',
      session_pct: null,
      weekly_pct: null,
      weekly_pct_opus: null,
      session_resets_in_min: null,
      session_resets_at_utc: null,
      weekly_resets_day: null,
      weekly_resets_at_utc: null,
      fetched_at: fetchedAt,
      error_message: `network: ${(e as Error).message}`,
    };
    writeOutput(out, outputPath);
    process.stderr.write(`usage-fetch: network error → stale (${(e as Error).message})\n`);
    process.exit(2);
  }

  const { status, bodyText, bodyJson } = httpResult;

  if (args.debugRaw) {
    process.stderr.write(`--- DEBUG-RAW ---\n`);
    process.stderr.write(`HTTP ${status}\n`);
    process.stderr.write(`url: ${ENDPOINT_BASE}/organizations/${orgId}/usage\n`);
    process.stderr.write(`body (raw):\n${bodyText}\n`);
    process.stderr.write(`--- END DEBUG-RAW ---\n`);
  }

  if (status === 401 || status === 403) {
    const out: OutputJson = {
      status: 'expired',
      session_pct: null,
      weekly_pct: null,
      weekly_pct_opus: null,
      session_resets_in_min: null,
      session_resets_at_utc: null,
      weekly_resets_day: null,
      weekly_resets_at_utc: null,
      fetched_at: fetchedAt,
      error_message: `HTTP ${status}: ${bodyText.slice(0, 200)}`,
    };
    writeOutput(out, outputPath);
    if (!args.noTelegram) await notifyTelegram(EXPIRED_TELEGRAM_MSG);
    process.stderr.write(`usage-fetch: HTTP ${status} → cookie expirada, Telegram enviado\n`);
    process.exit(1);
  }

  if (status === 429) {
    const out: OutputJson = {
      status: 'stale',
      session_pct: null,
      weekly_pct: null,
      weekly_pct_opus: null,
      session_resets_in_min: null,
      session_resets_at_utc: null,
      weekly_resets_day: null,
      weekly_resets_at_utc: null,
      fetched_at: fetchedAt,
      error_message: 'HTTP 429: rate-limited por claude.ai',
    };
    writeOutput(out, outputPath);
    process.stderr.write('usage-fetch: HTTP 429 → stale, reintentar en próximo cron\n');
    process.exit(2);
  }

  if (status !== 200) {
    const out: OutputJson = {
      status: 'error',
      session_pct: null,
      weekly_pct: null,
      weekly_pct_opus: null,
      session_resets_in_min: null,
      session_resets_at_utc: null,
      weekly_resets_day: null,
      weekly_resets_at_utc: null,
      fetched_at: fetchedAt,
      error_message: `HTTP ${status}: ${bodyText.slice(0, 200)}`,
    };
    writeOutput(out, outputPath);
    process.stderr.write(`usage-fetch: HTTP ${status} → error\n`);
    process.exit(3);
  }

  if (!bodyJson || typeof bodyJson !== 'object') {
    const out: OutputJson = {
      status: 'error',
      session_pct: null,
      weekly_pct: null,
      weekly_pct_opus: null,
      session_resets_in_min: null,
      session_resets_at_utc: null,
      weekly_resets_day: null,
      weekly_resets_at_utc: null,
      fetched_at: fetchedAt,
      error_message: `JSON malformado: ${bodyText.slice(0, 200)}`,
    };
    writeOutput(out, outputPath);
    process.stderr.write('usage-fetch: JSON malformado → error\n');
    process.exit(3);
  }

  const out = parseResponse(bodyJson as ClaudeApiResponse, fetchedAt);
  writeOutput(out, outputPath);
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(0);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const sessionKey = requireEnv('ANTHROPIC_USAGE_SESSION_KEY');

  if (args.mode === 'discover-org') {
    await modeDiscoverOrg(sessionKey);
  } else {
    await modeOnce(args, sessionKey);
  }
}

const isDirectInvocation =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main().catch((e) => {
    process.stderr.write(`usage-fetch: fatal: ${(e as Error).message}\n`);
    process.exit(3);
  });
}

export { parseResponse, type OutputJson, type ClaudeApiResponse };
