import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { obsidianCommand } from '../../../src/cli/obsidian';

interface Sandbox {
  ctxRoot: string;
  vaultPath: string;
  fakeHome: string;
  projectRoot: string;
  agentName: string;
  origHome: string;
  origFrameworkRoot: string | undefined;
}

function makeSandbox(opts?: { scopes?: Array<{ paths: string[]; permissions: string[] }>; auditLog?: boolean }): Sandbox {
  const fakeHome = mkdtempSync(join(tmpdir(), 'obs-home-'));
  const projectRoot = mkdtempSync(join(tmpdir(), 'obs-proj-'));
  const vaultPath = mkdtempSync(join(tmpdir(), 'obs-vault-'));
  const ctxRoot = join(fakeHome, '.cortextos', 'default');
  mkdirSync(join(ctxRoot, 'config'), { recursive: true });
  writeFileSync(join(ctxRoot, 'config', 'obsidian.json'), JSON.stringify({
    vault_path: vaultPath,
    vault_name: 'test-vault',
    lock_timeout_ms: 2000,
    audit_log: opts?.auditLog === true,
  }));

  const agentName = 'developer';
  const agentDir = join(projectRoot, 'orgs', 'testorg', 'agents', agentName);
  mkdirSync(agentDir, { recursive: true });
  const scopes = opts?.scopes ?? [
    { paths: ['Projects/CortexLab/**'], permissions: ['read', 'write', 'append'] },
    { paths: ['Daily/**'], permissions: ['read', 'append'] },
    { paths: ['**'], permissions: ['read'] },
  ];
  writeFileSync(join(agentDir, 'config.json'), JSON.stringify({
    agent_name: agentName,
    org: 'testorg',
    obsidian: { scopes },
  }));

  const origHome = process.env.HOME ?? '';
  const origFrameworkRoot = process.env.CTX_FRAMEWORK_ROOT;
  process.env.HOME = fakeHome;
  process.env.CTX_FRAMEWORK_ROOT = projectRoot;

  return { ctxRoot, vaultPath, fakeHome, projectRoot, agentName, origHome, origFrameworkRoot };
}

function teardown(sb: Sandbox): void {
  process.env.HOME = sb.origHome;
  if (sb.origFrameworkRoot === undefined) delete process.env.CTX_FRAMEWORK_ROOT;
  else process.env.CTX_FRAMEWORK_ROOT = sb.origFrameworkRoot;
  rmSync(sb.fakeHome, { recursive: true, force: true });
  rmSync(sb.projectRoot, { recursive: true, force: true });
  rmSync(sb.vaultPath, { recursive: true, force: true });
}

describe('cortextos obsidian write-note', () => {
  let sb: Sandbox;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sb = makeSandbox();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown(sb);
  });

  it('writes a note with frontmatter inside an allowed scope', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/notes/foo.md',
      '--agent', sb.agentName,
      '--content', 'body text',
      '--frontmatter', JSON.stringify({ tags: ['cortextos', 'demo'], status: 'active' }),
    ]);
    const written = readFileSync(join(sb.vaultPath, 'Projects/CortexLab/notes/foo.md'), 'utf-8');
    expect(written).toContain('---');
    expect(written).toContain('status: active');
    expect(written).toContain('tags: [cortextos, demo]');
    expect(written).toContain('body text');
    expect(written.indexOf('body text')).toBeGreaterThan(written.indexOf('---\n'));

    const out = JSON.parse(logSpy.mock.calls.flat().join('\n'));
    expect(out.ok).toBe(true);
    expect(out.path).toBe('Projects/CortexLab/notes/foo.md');
  });

  it('refuses to overwrite without --overwrite', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/x.md',
      '--agent', sb.agentName, '--content', 'first',
    ]);
    await expect(obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/x.md',
      '--agent', sb.agentName, '--content', 'second',
    ])).rejects.toThrow(/process\.exit/);
    expect(errSpy.mock.calls.flat().join('\n')).toContain('already exists');
    const written = readFileSync(join(sb.vaultPath, 'Projects/CortexLab/x.md'), 'utf-8');
    expect(written).toContain('first');
  });

  it('overwrites with --overwrite', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/x.md',
      '--agent', sb.agentName, '--content', 'first',
    ]);
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/x.md',
      '--agent', sb.agentName, '--content', 'second', '--overwrite',
    ]);
    const written = readFileSync(join(sb.vaultPath, 'Projects/CortexLab/x.md'), 'utf-8');
    expect(written).toContain('second');
    expect(written).not.toContain('first');
  });

  it('denies write outside permitted scope (fail-closed)', async () => {
    await expect(obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/Other/foo.md',
      '--agent', sb.agentName, '--content', 'x',
    ])).rejects.toThrow(/process\.exit\(3\)/);
    expect(existsSync(join(sb.vaultPath, 'Projects/Other/foo.md'))).toBe(false);
  });

  it('rejects path escape via ../', async () => {
    await expect(obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', '../escape.md',
      '--agent', sb.agentName, '--content', 'x',
    ])).rejects.toThrow(/process\.exit\(5\)/);
  });

  it('denies when agent has no obsidian config (fail-closed default)', async () => {
    teardown(sb);
    sb = makeSandbox({ scopes: [] });
    await expect(obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'foo.md', '--agent', sb.agentName, '--content', 'x',
    ])).rejects.toThrow(/process\.exit\(3\)/);
  });
});

describe('cortextos obsidian read-note + append-note', () => {
  let sb: Sandbox;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sb = makeSandbox();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown(sb);
  });

  it('round-trips frontmatter + body', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/r.md',
      '--agent', sb.agentName,
      '--frontmatter', JSON.stringify({ status: 'draft', tags: ['a', 'b'] }),
      '--content', 'hello world',
    ]);
    logSpy.mockClear();
    await obsidianCommand.parseAsync([
      'node', 'cli', 'read-note', 'Projects/CortexLab/r.md',
      '--agent', sb.agentName,
    ]);
    const out = JSON.parse(logSpy.mock.calls.flat().join('\n'));
    expect(out.frontmatter.status).toBe('draft');
    expect(out.frontmatter.tags).toEqual(['a', 'b']);
    expect(out.body.trim()).toBe('hello world');
  });

  it('append-note adds content', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/a.md',
      '--agent', sb.agentName, '--content', 'line 1',
    ]);
    await obsidianCommand.parseAsync([
      'node', 'cli', 'append-note', 'Projects/CortexLab/a.md', 'line 2',
      '--agent', sb.agentName,
    ]);
    const written = readFileSync(join(sb.vaultPath, 'Projects/CortexLab/a.md'), 'utf-8');
    expect(written).toContain('line 1');
    expect(written).toContain('line 2');
  });

  it('append-note denied without append permission', async () => {
    teardown(sb);
    sb = makeSandbox({
      scopes: [
        { paths: ['Projects/CortexLab/**'], permissions: ['read'] },
      ],
    });
    await expect(obsidianCommand.parseAsync([
      'node', 'cli', 'append-note', 'Projects/CortexLab/a.md', 'x',
      '--agent', sb.agentName,
    ])).rejects.toThrow(/process\.exit\(3\)/);
  });
});

describe('cortextos obsidian search-by-tag + list-notes', () => {
  let sb: Sandbox;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sb = makeSandbox();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown(sb);
  });

  it('search-by-tag finds notes with matching tag', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/one.md',
      '--agent', sb.agentName,
      '--frontmatter', JSON.stringify({ tags: ['research', 'cortextos'] }),
      '--content', 'a',
    ]);
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/two.md',
      '--agent', sb.agentName,
      '--frontmatter', JSON.stringify({ tags: ['other'] }),
      '--content', 'b',
    ]);
    logSpy.mockClear();
    await obsidianCommand.parseAsync([
      'node', 'cli', 'search-by-tag', 'cortextos',
      '--agent', sb.agentName,
    ]);
    const out = JSON.parse(logSpy.mock.calls.flat().join('\n'));
    expect(out.matches.length).toBe(1);
    expect(out.matches[0].path).toBe('Projects/CortexLab/one.md');
  });

  it('list-notes recursive returns md files only, filtered by scope', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/x.md',
      '--agent', sb.agentName, '--content', 'x',
    ]);
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/sub/y.md',
      '--agent', sb.agentName, '--content', 'y',
    ]);
    logSpy.mockClear();
    await obsidianCommand.parseAsync([
      'node', 'cli', 'list-notes', 'Projects/CortexLab',
      '--agent', sb.agentName, '--recursive',
    ]);
    const out = JSON.parse(logSpy.mock.calls.flat().join('\n'));
    const paths = out.items.map((i: any) => i.path).sort();
    expect(paths).toEqual(['Projects/CortexLab/sub/y.md', 'Projects/CortexLab/x.md']);
  });
});

describe('cortextos obsidian update-frontmatter', () => {
  let sb: Sandbox;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sb = makeSandbox();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown(sb);
  });

  it('updates a single frontmatter key without touching body', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'write-note', 'Projects/CortexLab/fm.md',
      '--agent', sb.agentName,
      '--frontmatter', JSON.stringify({ status: 'draft', tags: ['a'] }),
      '--content', 'body text',
    ]);
    await obsidianCommand.parseAsync([
      'node', 'cli', 'update-frontmatter', 'Projects/CortexLab/fm.md', 'status', '"published"',
      '--agent', sb.agentName,
    ]);
    const written = readFileSync(join(sb.vaultPath, 'Projects/CortexLab/fm.md'), 'utf-8');
    expect(written).toContain('status: published');
    expect(written).toContain('tags: [a]');
    expect(written).toContain('body text');
  });
});

describe('cortextos obsidian append-daily', () => {
  let sb: Sandbox;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sb = makeSandbox();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown(sb);
  });

  it('appends to today\'s daily note (creates it if missing)', async () => {
    await obsidianCommand.parseAsync([
      'node', 'cli', 'append-daily', 'first entry',
      '--agent', sb.agentName,
    ]);
    await obsidianCommand.parseAsync([
      'node', 'cli', 'append-daily', 'second entry',
      '--agent', sb.agentName,
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const dailyPath = join(sb.vaultPath, 'Daily', `${today}.md`);
    expect(existsSync(dailyPath)).toBe(true);
    const content = readFileSync(dailyPath, 'utf-8');
    expect(content).toContain('first entry');
    expect(content).toContain('second entry');
  });
});
