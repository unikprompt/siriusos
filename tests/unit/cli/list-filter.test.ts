/**
 * Tests for the --filter flag added to `cortextos list-skills` and
 * `cortextos list-agents`. Mirrors the type-to-filter capability that
 * Claude Code 2.1.121 added to its `/skills` picker.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listSkillsCommand } from '../../../src/cli/list-skills';
import { listAgentsCommand } from '../../../src/cli/list-agents';

describe('list-skills --filter', () => {
  let agentDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'list-skills-filter-'));
    const skillsDir = join(agentDir, 'skills');
    mkdirSync(skillsDir, { recursive: true });

    for (const [name, desc] of [
      ['cron-management', 'Manage scheduled crons and recurring tasks'],
      ['comms', 'Telegram and inbox formatting reference'],
      ['tasks', 'Task lifecycle and KPI logging'],
    ]) {
      const dir = join(skillsDir, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\nbody\n`);
    }

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(agentDir, { recursive: true, force: true });
  });

  it('returns at least the agent-level skills when --filter is omitted', async () => {
    await listSkillsCommand.parseAsync([
      'node', 'cli', '--agent-dir', agentDir, '--format', 'json',
    ]);
    const last = logSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(last) as Array<{ name: string }>;
    const names = parsed.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining(['comms', 'cron-management', 'tasks']));
  });

  it('matches against skill name (case-insensitive)', async () => {
    await listSkillsCommand.parseAsync([
      'node', 'cli', '--agent-dir', agentDir, '--format', 'json', '--filter', 'CRON',
    ]);
    const last = logSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(last) as Array<{ name: string; source: string }>;
    // Scope to agent-level skills — the in-process test runs against the real
    // cortextos cwd, so framework/community skills also surface and may match.
    expect(parsed.filter(s => s.source === 'agent').map(s => s.name)).toEqual(['cron-management']);
  });

  it('matches against skill description', async () => {
    await listSkillsCommand.parseAsync([
      'node', 'cli', '--agent-dir', agentDir, '--format', 'json', '--filter', 'telegram',
    ]);
    const last = logSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(last) as Array<{ name: string; source: string }>;
    expect(parsed.filter(s => s.source === 'agent').map(s => s.name)).toEqual(['comms']);
  });

  it('returns an empty list when nothing matches', async () => {
    await listSkillsCommand.parseAsync([
      'node', 'cli', '--agent-dir', agentDir, '--format', 'json', '--filter', 'doesnotexist',
    ]);
    const last = logSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(last) as Array<{ name: string }>;
    expect(parsed).toEqual([]);
  });
});

describe('list-agents --filter', () => {
  let projectRoot: string;
  let fakeHome: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let origHome: string;
  let origFrameworkRoot: string | undefined;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'list-agents-filter-home-'));
    projectRoot = mkdtempSync(join(tmpdir(), 'list-agents-filter-proj-'));
    const ctxRoot = join(fakeHome, '.cortextos', 'default');
    mkdirSync(join(ctxRoot, 'config'), { recursive: true });

    // Three agents under one org
    for (const [name, role] of [
      ['developer', 'Senior backend developer'],
      ['content', 'Creative content agent'],
      ['orquestador', 'Daily standup orchestrator'],
    ]) {
      const agentDir = join(projectRoot, 'orgs', 'testorg', 'agents', name);
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'config.json'), JSON.stringify({
        agent_name: name,
        display_name: name,
        role,
        org: 'testorg',
      }));
      // IDENTITY.md so buildAgentInfo can pick up display name + role
      writeFileSync(join(agentDir, 'IDENTITY.md'), `# ${name}\n\nRole: ${role}\n`);
    }

    writeFileSync(join(ctxRoot, 'config', 'enabled-agents.json'), JSON.stringify({
      developer: { enabled: true, org: 'testorg' },
      content: { enabled: true, org: 'testorg' },
      orquestador: { enabled: true, org: 'testorg' },
    }));

    origHome = process.env.HOME ?? '';
    origFrameworkRoot = process.env.CTX_FRAMEWORK_ROOT;
    process.env.HOME = fakeHome;
    process.env.CTX_FRAMEWORK_ROOT = projectRoot;

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.HOME = origHome;
    if (origFrameworkRoot === undefined) delete process.env.CTX_FRAMEWORK_ROOT;
    else process.env.CTX_FRAMEWORK_ROOT = origFrameworkRoot;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('matches by agent name (case-insensitive)', async () => {
    await listAgentsCommand.parseAsync([
      'node', 'cli', '--format', 'json', '--filter', 'DEV',
    ]);
    const last = logSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(last) as Array<{ name: string }>;
    expect(parsed.map(a => a.name)).toEqual(['developer']);
  });

  it('matches by role substring', async () => {
    await listAgentsCommand.parseAsync([
      'node', 'cli', '--format', 'json', '--filter', 'orchestrator',
    ]);
    const last = logSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(last) as Array<{ name: string }>;
    expect(parsed.map(a => a.name)).toEqual(['orquestador']);
  });

  it('returns empty when nothing matches', async () => {
    await listAgentsCommand.parseAsync([
      'node', 'cli', '--format', 'json', '--filter', 'noagentnamedlikethis',
    ]);
    const last = logSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(last) as Array<{ name: string }>;
    expect(parsed).toEqual([]);
  });
});
