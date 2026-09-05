import { NextRequest } from 'next/server';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { getFrameworkRoot } from '@/lib/config';
import {
  DASHBOARD_LIFECYCLE_ACTIONS,
  buildLifecycleCliArgs,
  buildPurgeCliArgs,
  type DashboardLifecycleAction,
} from '@/lib/agent-lifecycle';

export const dynamic = 'force-dynamic';

const IDENTIFIER = /^[a-z0-9_-]+$/;

function validateIdentifier(value: string | null | undefined, field: string): string {
  if (!value || !IDENTIFIER.test(value)) {
    throw new Error(`Invalid ${field}: must match [a-z0-9_-]+`);
  }
  return value;
}

function runSiriusCli(args: string[]): { ok: true } | { ok: false; error: string } {
  const frameworkRoot = getFrameworkRoot();
  const cliPath = join(frameworkRoot, 'dist', 'cli.js');
  if (!existsSync(cliPath)) {
    return { ok: false, error: 'SiriusOS CLI is not built. Run npm run build.' };
  }

  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: frameworkRoot,
    env: {
      ...process.env,
      CTX_FRAMEWORK_ROOT: frameworkRoot,
    },
    encoding: 'utf-8',
    timeout: 45_000,
    stdio: 'pipe',
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'SiriusOS CLI action failed')
      .trim()
      .split('\n')
      .slice(-4)
      .join(' ');
    return { ok: false, error: detail };
  }
  return { ok: true };
}

// POST /api/agents/[name]/lifecycle
// Body: { action: start|stop|restart_continue|restart_fresh, org?: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  let agent: string;
  try {
    agent = validateIdentifier(decoded, 'agent name');
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawAction = body.action;
  if (
    typeof rawAction !== 'string'
    || !DASHBOARD_LIFECYCLE_ACTIONS.some(action => action === rawAction)
  ) {
    return Response.json(
      { error: `action must be one of: ${DASHBOARD_LIFECYCLE_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  let org: string | undefined;
  if (body.org !== undefined) {
    try {
      org = validateIdentifier(String(body.org), 'org');
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  const instance = process.env.CTX_INSTANCE_ID ?? 'default';
  let cliArgs: string[];
  try {
    cliArgs = buildLifecycleCliArgs(rawAction as DashboardLifecycleAction, agent, instance, org);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  const result = runSiriusCli(cliArgs);
  if (!result.ok) {
    console.error(`[api/agents/${agent}/lifecycle] ${rawAction} failed: ${result.error}`);
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({
    success: true,
    action: rawAction,
    agent,
    output: `Action executed via siriusos ${cliArgs[0]}`,
  });
}

// DELETE /api/agents/[name]/lifecycle?org=<org>
// Performs the canonical full purge: definition, credentials, memory, runtime
// state, logs, mailboxes, analytics, crons, and enabled-agents registry entry.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  let agent: string;
  let org: string;
  try {
    agent = validateIdentifier(decodeURIComponent(name), 'agent name');
    org = validateIdentifier(request.nextUrl.searchParams.get('org'), 'org');
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  const instance = process.env.CTX_INSTANCE_ID ?? 'default';
  const cliArgs = buildPurgeCliArgs(agent, instance, org);
  const result = runSiriusCli(cliArgs);
  if (!result.ok) {
    console.error(`[api/agents/${agent}/lifecycle] purge failed: ${result.error}`);
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ success: true, deleted: agent, purged: true });
}
