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

  it('claude_effort: passed via --effort when set to a valid level', () => {
    const args = anthropicStrategy.buildArgs(makeOpts({ config: { claude_effort: 'medium' } }));
    const idx = args.indexOf('--effort');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('medium');
  });

  it('claude_effort: absent means no --effort flag (Claude Code default applies)', () => {
    const args = anthropicStrategy.buildArgs(makeOpts());
    expect(args).not.toContain('--effort');
  });

  it('claude_effort: an out-of-range value is skipped, not forwarded', () => {
    const args = anthropicStrategy.buildArgs(makeOpts({
      // @ts-expect-error — deliberately invalid effort to exercise the runtime guard
      config: { claude_effort: 'ultra' },
    }));
    expect(args).not.toContain('--effort');
  });

  it('claude_effort + model: prompt still last, both flags present', () => {
    const args = anthropicStrategy.buildArgs(makeOpts({ config: { model: 'claude-fable-5-1', claude_effort: 'medium' } }));
    expect(args).toContain('--model');
    expect(args).toContain('--effort');
    expect(args[args.length - 1]).toBe('hello');
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
