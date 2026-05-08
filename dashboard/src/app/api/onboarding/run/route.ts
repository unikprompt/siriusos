import { NextResponse } from 'next/server';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateAgentName,
  validateOrgName,
  writeAgentEnv,
  validateTelegramCreds,
  findProjectRoot,
} from '@/lib/services/onboarding';

type Locale = 'en' | 'es';

interface RunBody {
  language?: Locale;
  instance?: string;
  orgName?: string;
  orgDescription?: string;
  orchestratorName?: string;
  botToken?: string;
  chatId?: string;
}

interface LogEntry {
  step: string;
  status: 'ok' | 'fail' | 'info';
  output: string;
}

interface RunResult {
  ok: boolean;
  reason?: string;
  message?: string;
  logs: LogEntry[];
}

function logsAdd(logs: LogEntry[], step: string, status: LogEntry['status'], output: string): void {
  logs.push({ step, status, output });
}

function spawnCli(projectRoot: string, args: string[]): { ok: boolean; output: string } {
  const cliPath = join(projectRoot, 'dist', 'cli.js');
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf-8',
    env: process.env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { ok: result.status === 0, output };
}

function persistOrgLanguage(projectRoot: string, orgName: string, locale: Locale): void {
  const ctxPath = join(projectRoot, 'orgs', orgName, 'context.json');
  let ctx: Record<string, unknown> = {};
  if (existsSync(ctxPath)) {
    try {
      ctx = JSON.parse(readFileSync(ctxPath, 'utf-8'));
    } catch {
      ctx = {};
    }
  }
  ctx.language = locale;
  writeFileSync(ctxPath, JSON.stringify(ctx, null, 2) + '\n', 'utf-8');
}

/**
 * Orchestrate `siriusos setup` programmatically. Mirrors the steps of
 * src/cli/setup.ts but driven by JSON input from the visual wizard.
 *
 * Each CLI subcommand is invoked as a subprocess so its existing output
 * and side effects (state directories, atomic writes, PM2 config) stay
 * the source of truth. We collect stdout/stderr per step and return a
 * structured log so the wizard can render it.
 */
export async function POST(request: Request) {
  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'bad_request', logs: [] } satisfies RunResult,
      { status: 400 },
    );
  }

  const language: Locale = body.language === 'es' ? 'es' : 'en';
  const instance = body.instance?.trim() || 'default';
  const orgName = body.orgName?.trim() ?? '';
  const orchName = body.orchestratorName?.trim() ?? '';
  const botToken = body.botToken?.trim() ?? '';
  const chatId = body.chatId?.trim() ?? '';

  if (!validateOrgName(orgName)) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_org_name', logs: [] } satisfies RunResult,
      { status: 400 },
    );
  }
  if (!validateAgentName(orchName)) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_agent_name', logs: [] } satisfies RunResult,
      { status: 400 },
    );
  }
  if (!botToken || !chatId) {
    return NextResponse.json(
      { ok: false, reason: 'missing_telegram', logs: [] } satisfies RunResult,
      { status: 400 },
    );
  }

  const projectRoot = findProjectRoot();
  const logs: LogEntry[] = [];

  // Pre-flight: re-validate Telegram credentials server-side. Catches the
  // case where the client validated, then someone tampered with the request
  // body, or the bot was revoked between steps.
  try {
    const tg = await validateTelegramCreds(botToken, chatId);
    if (!tg.ok) {
      logsAdd(logs, 'validate_telegram', 'fail', JSON.stringify(tg));
      return NextResponse.json(
        { ok: false, reason: 'telegram_validation_failed', logs } satisfies RunResult,
        { status: 400 },
      );
    }
    logsAdd(logs, 'validate_telegram', 'ok', `@${tg.botUsername} → chat ${chatId} (${tg.chatType})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logsAdd(logs, 'validate_telegram', 'fail', message);
    return NextResponse.json(
      { ok: false, reason: 'telegram_validation_crash', message, logs } satisfies RunResult,
      { status: 500 },
    );
  }

  // Step 1: install — creates ~/.siriusos/<instance>/ and friends.
  const install = spawnCli(projectRoot, ['install', '--instance', instance]);
  logsAdd(logs, 'install', install.ok ? 'ok' : 'fail', install.output);
  if (!install.ok) {
    return NextResponse.json({ ok: false, reason: 'install_failed', logs } satisfies RunResult, { status: 500 });
  }

  // Step 2: init — creates orgs/<orgName>/ skeleton.
  const init = spawnCli(projectRoot, ['init', orgName, '--instance', instance]);
  logsAdd(logs, 'init', init.ok ? 'ok' : 'fail', init.output);
  if (!init.ok) {
    return NextResponse.json({ ok: false, reason: 'init_failed', logs } satisfies RunResult, { status: 500 });
  }

  // Persist language preference into the freshly created org context.
  try {
    persistOrgLanguage(projectRoot, orgName, language);
    if (body.orgDescription?.trim()) {
      const ctxPath = join(projectRoot, 'orgs', orgName, 'context.json');
      const ctx = JSON.parse(readFileSync(ctxPath, 'utf-8'));
      ctx.description = body.orgDescription.trim();
      writeFileSync(ctxPath, JSON.stringify(ctx, null, 2) + '\n', 'utf-8');
    }
    logsAdd(logs, 'persist_context', 'ok', `language=${language}${body.orgDescription ? ' + description' : ''}`);
  } catch (err) {
    logsAdd(logs, 'persist_context', 'fail', err instanceof Error ? err.message : String(err));
    // Non-fatal — keep going.
  }

  // Step 3: add-agent (orchestrator).
  const addAgent = spawnCli(projectRoot, [
    'add-agent', orchName,
    '--template', 'orchestrator',
    '--org', orgName,
    '--instance', instance,
  ]);
  logsAdd(logs, 'add_agent', addAgent.ok ? 'ok' : 'fail', addAgent.output);
  if (!addAgent.ok) {
    return NextResponse.json({ ok: false, reason: 'add_agent_failed', logs } satisfies RunResult, { status: 500 });
  }

  // Step 4: write .env for the orchestrator.
  try {
    const orchDir = join(projectRoot, 'orgs', orgName, 'agents', orchName);
    writeAgentEnv(orchDir, botToken, chatId);
    logsAdd(logs, 'write_env', 'ok', `wrote .env for ${orchName}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logsAdd(logs, 'write_env', 'fail', message);
    return NextResponse.json({ ok: false, reason: 'env_write_failed', message, logs } satisfies RunResult, { status: 500 });
  }

  // Step 5: enable — preflight check + activation.
  const enable = spawnCli(projectRoot, ['enable', orchName, '--org', orgName, '--instance', instance]);
  logsAdd(logs, 'enable', enable.ok ? 'ok' : 'fail', enable.output);
  if (!enable.ok) {
    return NextResponse.json({ ok: false, reason: 'enable_failed', logs } satisfies RunResult, { status: 500 });
  }

  // Step 6: ecosystem — generate PM2 config.
  const eco = spawnCli(projectRoot, ['ecosystem', '--instance', instance]);
  logsAdd(logs, 'ecosystem', eco.ok ? 'ok' : 'fail', eco.output);
  if (!eco.ok) {
    return NextResponse.json({ ok: false, reason: 'ecosystem_failed', logs } satisfies RunResult, { status: 500 });
  }

  // Step 7: pm2 start (with siriusos start fallback).
  const pm2Start = spawnSync('pm2', ['start', 'ecosystem.config.js'], {
    cwd: projectRoot,
    encoding: 'utf-8',
    env: process.env,
  });
  if (pm2Start.status === 0) {
    spawnSync('pm2', ['save'], { cwd: projectRoot, encoding: 'utf-8', env: process.env });
    logsAdd(logs, 'pm2_start', 'ok', `${pm2Start.stdout ?? ''}${pm2Start.stderr ?? ''}`.trim());
  } else {
    const fallback = spawnCli(projectRoot, ['start', '--instance', instance]);
    logsAdd(logs, 'pm2_start', fallback.ok ? 'ok' : 'fail', `pm2 missing → siriusos start\n${fallback.output}`);
    if (!fallback.ok) {
      return NextResponse.json({ ok: false, reason: 'start_failed', logs } satisfies RunResult, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, logs } satisfies RunResult);
}
