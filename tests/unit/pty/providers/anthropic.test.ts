import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { anthropicStrategy } from '../../../../src/pty/providers/anthropic';
import type { ProviderSpawnOptions } from '../../../../src/pty/providers/types';

describe('anthropicStrategy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortextos-anthropic-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeOpts = (overrides: Partial<ProviderSpawnOptions> = {}): ProviderSpawnOptions => ({
    mode: 'fresh',
    prompt: 'hello',
    config: {},
    agentDir: tmpDir,
    ...overrides,
  });

  it('command is claude (non-windows)', () => {
    const cmd = anthropicStrategy.command();
    expect(cmd === 'claude' || cmd === 'claude.cmd').toBe(true);
  });

  it('fresh mode: no --continue, has --dangerously-skip-permissions, prompt last', () => {
    const args = anthropicStrategy.buildArgs(makeOpts());
    expect(args).not.toContain('--continue');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args[args.length - 1]).toBe('hello');
  });

  it('continue mode: emits --continue as first arg', () => {
    const args = anthropicStrategy.buildArgs(makeOpts({ mode: 'continue' }));
    expect(args[0]).toBe('--continue');
  });

  it('model: passed via --model when set', () => {
    const args = anthropicStrategy.buildArgs(makeOpts({ config: { model: 'claude-opus-4-6' } }));
    const idx = args.indexOf('--model');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('claude-opus-4-6');
  });

  it('local/*.md files: concatenated into --append-system-prompt', () => {
    const localDir = join(tmpDir, 'local');
    mkdirSync(localDir);
    writeFileSync(join(localDir, 'a.md'), 'rule A');
    writeFileSync(join(localDir, 'b.md'), 'rule B');

    const args = anthropicStrategy.buildArgs(makeOpts());
    const idx = args.indexOf('--append-system-prompt');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('rule A\n\nrule B');
  });

  it('no local/ dir: no --append-system-prompt', () => {
    const args = anthropicStrategy.buildArgs(makeOpts());
    expect(args).not.toContain('--append-system-prompt');
  });
});
