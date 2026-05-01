/**
 * Tests for `cortextos purge agent` and `cortextos purge org`.
 *
 * Inspired by Claude Code 2.1.126's `claude project purge`. The command
 * removes runtime state (state/, logs/, mailboxes/, analytics/), the agent
 * definition under orgs/<org>/agents/<name>, and the registry entry in
 * enabled-agents.json — with --dry-run, --yes, --keep-state, and
 * --keep-definition flags.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { purgeCommand } from '../../../src/cli/purge';

interface Sandbox {
  projectRoot: string;
  ctxRoot: string;
  origCwd: string;
  origHome: string;
  realHome: string;
}

function setupSandbox(instance = 'default', org = 'testorg', agent = 'sample'): Sandbox {
  const realHome = homedir();
  const fakeHome = mkdtempSync(join(tmpdir(), 'cortextos-purge-'));
  const projectRoot = mkdtempSync(join(tmpdir(), 'cortextos-purge-proj-'));
  const ctxRoot = join(fakeHome, '.cortextos', instance);

  // Runtime state directories with content
  for (const sub of ['state', 'logs', 'inbox', 'outbox', 'inflight', 'processed', 'analytics']) {
    const dir = join(ctxRoot, sub, agent);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sample.txt'), 'hello');
  }

  // Agent definition
  const defDir = join(projectRoot, 'orgs', org, 'agents', agent);
  mkdirSync(defDir, { recursive: true });
  writeFileSync(join(defDir, 'config.json'), JSON.stringify({ agent_name: agent }));

  // enabled-agents.json registry
  const configDir = join(ctxRoot, 'config');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, 'enabled-agents.json'),
    JSON.stringify({ [agent]: { enabled: true, status: 'configured', org }, other: { enabled: true, org } }, null, 2),
  );

  const origCwd = process.cwd();
  const origHome = process.env.HOME ?? '';
  process.chdir(projectRoot);
  process.env.HOME = fakeHome;
  process.env.CTX_PROJECT_ROOT = projectRoot;
  process.env.CTX_FRAMEWORK_ROOT = projectRoot;

  return { projectRoot, ctxRoot, origCwd, origHome, realHome };
}

function teardownSandbox(s: Sandbox) {
  process.chdir(s.origCwd);
  process.env.HOME = s.origHome;
  delete process.env.CTX_PROJECT_ROOT;
  delete process.env.CTX_FRAMEWORK_ROOT;
  rmSync(s.projectRoot, { recursive: true, force: true });
  rmSync(join(s.ctxRoot, '..', '..'), { recursive: true, force: true });
}

describe('cortextos purge agent', () => {
  let s: Sandbox;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    s = setupSandbox();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardownSandbox(s);
  });

  it('rejects invalid agent names before touching the filesystem', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT_${code}__`);
    }) as never);

    await expect(
      purgeCommand.parseAsync(['node', 'cli', 'agent', 'BadName', '--yes']),
    ).rejects.toThrow(/__EXIT_1__/);

    expect(exitSpy).toHaveBeenCalledWith(1);
    // Sandbox state must be untouched
    expect(existsSync(join(s.ctxRoot, 'state', 'sample'))).toBe(true);
  });

  it('dry-run reports paths but deletes nothing', async () => {
    await purgeCommand.parseAsync(['node', 'cli', 'agent', 'sample', '--dry-run']);

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Purge plan for agent: sample');
    expect(output).toContain('--dry-run: nothing was deleted.');

    // All paths still present
    expect(existsSync(join(s.ctxRoot, 'state', 'sample'))).toBe(true);
    expect(existsSync(join(s.ctxRoot, 'logs', 'sample'))).toBe(true);
    expect(existsSync(join(s.projectRoot, 'orgs', 'testorg', 'agents', 'sample'))).toBe(true);
    const enabled = JSON.parse(readFileSync(join(s.ctxRoot, 'config', 'enabled-agents.json'), 'utf-8'));
    expect(enabled.sample).toBeDefined();
  });

  it('--yes purges every runtime dir, definition, and registry entry', async () => {
    await purgeCommand.parseAsync(['node', 'cli', 'agent', 'sample', '--yes']);

    for (const sub of ['state', 'logs', 'inbox', 'outbox', 'inflight', 'processed', 'analytics']) {
      expect(existsSync(join(s.ctxRoot, sub, 'sample'))).toBe(false);
    }
    expect(existsSync(join(s.projectRoot, 'orgs', 'testorg', 'agents', 'sample'))).toBe(false);

    const enabled = JSON.parse(readFileSync(join(s.ctxRoot, 'config', 'enabled-agents.json'), 'utf-8'));
    expect(enabled.sample).toBeUndefined();
    // Other agents in the registry must remain untouched
    expect(enabled.other).toBeDefined();
  });

  it('--keep-state removes the definition but preserves runtime state', async () => {
    await purgeCommand.parseAsync(['node', 'cli', 'agent', 'sample', '--yes', '--keep-state']);

    expect(existsSync(join(s.ctxRoot, 'state', 'sample'))).toBe(true);
    expect(existsSync(join(s.ctxRoot, 'logs', 'sample'))).toBe(true);
    expect(existsSync(join(s.projectRoot, 'orgs', 'testorg', 'agents', 'sample'))).toBe(false);
  });

  it('--keep-definition wipes runtime state but preserves the definition', async () => {
    await purgeCommand.parseAsync(['node', 'cli', 'agent', 'sample', '--yes', '--keep-definition']);

    expect(existsSync(join(s.ctxRoot, 'state', 'sample'))).toBe(false);
    expect(existsSync(join(s.ctxRoot, 'logs', 'sample'))).toBe(false);
    expect(existsSync(join(s.projectRoot, 'orgs', 'testorg', 'agents', 'sample'))).toBe(true);
    // Registry entry preserved (definition is what binds to it)
    const enabled = JSON.parse(readFileSync(join(s.ctxRoot, 'config', 'enabled-agents.json'), 'utf-8'));
    expect(enabled.sample).toBeDefined();
  });

  it('rejects --keep-state combined with --keep-definition', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT_${code}__`);
    }) as never);

    await expect(
      purgeCommand.parseAsync(['node', 'cli', 'agent', 'sample', '--yes', '--keep-state', '--keep-definition']),
    ).rejects.toThrow(/__EXIT_2__/);

    expect(exitSpy).toHaveBeenCalledWith(2);
    // Nothing deleted
    expect(existsSync(join(s.ctxRoot, 'state', 'sample'))).toBe(true);
    expect(existsSync(join(s.projectRoot, 'orgs', 'testorg', 'agents', 'sample'))).toBe(true);
  });

  it('reports nothing-to-purge cleanly when the agent has no state', async () => {
    await purgeCommand.parseAsync(['node', 'cli', 'agent', 'ghost', '--yes']);

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toMatch(/No state found for agent "ghost"/);
  });
});

describe('cortextos purge org', () => {
  let s: Sandbox;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    s = setupSandbox();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardownSandbox(s);
  });

  it('purges the org directory and every agent inside it', async () => {
    // Add a second agent under the same org
    const second = join(s.projectRoot, 'orgs', 'testorg', 'agents', 'second');
    mkdirSync(second, { recursive: true });
    writeFileSync(join(second, 'config.json'), '{}');
    mkdirSync(join(s.ctxRoot, 'state', 'second'), { recursive: true });
    writeFileSync(join(s.ctxRoot, 'state', 'second', 'x.txt'), 'x');

    await purgeCommand.parseAsync(['node', 'cli', 'org', 'testorg', '--yes']);

    expect(existsSync(join(s.projectRoot, 'orgs', 'testorg'))).toBe(false);
    expect(existsSync(join(s.ctxRoot, 'state', 'sample'))).toBe(false);
    expect(existsSync(join(s.ctxRoot, 'state', 'second'))).toBe(false);
  });

  it('dry-run lists agents but deletes nothing', async () => {
    await purgeCommand.parseAsync(['node', 'cli', 'org', 'testorg', '--dry-run']);

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Purge plan for organization: testorg');
    expect(output).toContain('--dry-run: nothing was deleted.');
    expect(existsSync(join(s.projectRoot, 'orgs', 'testorg'))).toBe(true);
    expect(existsSync(join(s.ctxRoot, 'state', 'sample'))).toBe(true);
  });

  it('reports cleanly when the org does not exist', async () => {
    await purgeCommand.parseAsync(['node', 'cli', 'org', 'noexist', '--yes']);

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toMatch(/Organization "noexist" not found/);
  });
});
