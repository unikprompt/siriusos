import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { getFrameworkRoot } from '@/lib/config';

export const dynamic = 'force-dynamic';

interface CliSkill { name: string; description: string; path: string; source: string }

/**
 * Returns the skills a single agent actually sees at runtime, by shelling
 * out to `siriusos bus list-skills --format json` with the agent's env.
 *
 * Used by the Skills page when the user picks an agent from the "In use"
 * tab dropdown — it shows the same answer the agent would get if it asked
 * `bus list-skills` itself, including community + template-embedded +
 * agent-local sources.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const agent = url.searchParams.get('agent')?.trim() ?? '';
  const org = url.searchParams.get('org')?.trim() ?? '';

  if (!agent || !org) {
    return Response.json({ error: 'agent and org are required' }, { status: 400 });
  }

  const frameworkRoot = getFrameworkRoot();
  const cliPath = path.join(frameworkRoot, 'dist', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    return Response.json({ error: 'siriusos CLI binary not found at dist/cli.js' }, { status: 500 });
  }

  const agentDir = path.join(frameworkRoot, 'orgs', org, 'agents', agent);
  if (!fs.existsSync(agentDir)) {
    return Response.json({ error: `Agent not found: ${org}/${agent}` }, { status: 404 });
  }

  const result = spawnSync(process.execPath, [cliPath, 'bus', 'list-skills', '--format', 'json'], {
    cwd: frameworkRoot,
    encoding: 'utf-8',
    timeout: 8000,
    env: {
      ...process.env,
      CTX_FRAMEWORK_ROOT: frameworkRoot,
      CTX_AGENT_NAME: agent,
      CTX_AGENT_DIR: agentDir,
      CTX_ORG: org,
    },
  });

  if (result.status !== 0) {
    return Response.json(
      { error: 'list-skills failed', stderr: (result.stderr ?? '').toString().trim() },
      { status: 500 },
    );
  }

  let parsed: CliSkill[] = [];
  try {
    parsed = JSON.parse(result.stdout) as CliSkill[];
  } catch {
    return Response.json({ error: 'list-skills output was not valid JSON' }, { status: 500 });
  }

  return Response.json({
    agent,
    org,
    skills: parsed.map((s) => ({ name: s.name, source: s.source })),
  });
}
