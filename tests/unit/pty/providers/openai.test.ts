import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openaiStrategy } from '../../../../src/pty/providers/openai';
import type { ProviderSpawnOptions } from '../../../../src/pty/providers/types';

describe('openaiStrategy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortextos-openai-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeOpts = (overrides: Partial<ProviderSpawnOptions> = {}): ProviderSpawnOptions => ({
    mode: 'fresh',
    prompt: 'hola',
    config: {},
    agentDir: tmpDir,
    ...overrides,
  });

  it('command is codex (non-windows)', () => {
    const cmd = openaiStrategy.command();
    expect(cmd === 'codex' || cmd === 'codex.cmd').toBe(true);
  });

  it('fresh mode: no resume, has sandbox flags, prompt last', () => {
    const args = openaiStrategy.buildArgs(makeOpts());
    expect(args).not.toContain('resume');
    expect(args).toContain('--sandbox');
    expect(args).toContain('danger-full-access');
    expect(args).toContain('--ask-for-approval');
    expect(args).toContain('never');
    expect(args[args.length - 1]).toBe('hola');
  });

  it('continue mode: does NOT emit resume (Codex resume unreliable in interactive mode)', () => {
    const args = openaiStrategy.buildArgs(makeOpts({ mode: 'continue' }));
    expect(args).not.toContain('resume');
    expect(args).not.toContain('--last');
    // Continue-mode args look identical to fresh-mode args; prompt still flows via argv
    expect(args).toContain('--sandbox');
    expect(args[args.length - 1]).toBe('hola');
  });

  it('model: passed via --model when set', () => {
    const args = openaiStrategy.buildArgs(makeOpts({ config: { model: 'gpt-5.3-codex' } }));
    const idx = args.indexOf('--model');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('gpt-5.3-codex');
  });

  it('prepareWorkspace: writes AGENTS.md from local/*.md when none exists', async () => {
    const localDir = join(tmpDir, 'local');
    mkdirSync(localDir);
    writeFileSync(join(localDir, 'a.md'), 'rule A');
    writeFileSync(join(localDir, 'b.md'), 'rule B');

    await openaiStrategy.prepareWorkspace!(makeOpts());

    const agentsPath = join(tmpDir, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('<!-- cortextos:begin -->');
    expect(content).toContain('rule A');
    expect(content).toContain('rule B');
    expect(content).toContain('<!-- cortextos:end -->');
  });

  it('prepareWorkspace: preserves existing AGENTS.md user content outside marker block', async () => {
    const localDir = join(tmpDir, 'local');
    mkdirSync(localDir);
    writeFileSync(join(localDir, 'a.md'), 'generated rule');

    const agentsPath = join(tmpDir, 'AGENTS.md');
    writeFileSync(agentsPath, '# My Custom Instructions\n\nKeep this.\n');

    await openaiStrategy.prepareWorkspace!(makeOpts());

    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('# My Custom Instructions');
    expect(content).toContain('Keep this.');
    expect(content).toContain('generated rule');
  });

  it('prepareWorkspace: replaces stale marker block on subsequent runs (idempotent)', async () => {
    const localDir = join(tmpDir, 'local');
    mkdirSync(localDir);
    writeFileSync(join(localDir, 'a.md'), 'version 1');

    await openaiStrategy.prepareWorkspace!(makeOpts());

    // Rewrite local file and re-run
    writeFileSync(join(localDir, 'a.md'), 'version 2');
    await openaiStrategy.prepareWorkspace!(makeOpts());

    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('version 2');
    expect(content).not.toContain('version 1');
    // Only one marker block
    expect(content.match(/cortextos:begin/g)?.length).toBe(1);
  });

  it('prepareWorkspace: no-op when local/ is absent', async () => {
    await openaiStrategy.prepareWorkspace!(makeOpts());
    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(false);
  });
});
