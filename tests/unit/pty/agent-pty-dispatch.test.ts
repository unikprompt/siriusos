import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AgentPTY } from '../../../src/pty/agent-pty';
import type { AgentConfig, CtxEnv } from '../../../src/types';

interface FakePty {
  pid: number;
  write(data: string): void;
  onData(cb: (data: string) => void): { dispose(): void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void };
  kill(signal?: string): void;
  resize(cols: number, rows: number): void;
}

function makeFakePty(): FakePty {
  return {
    pid: 12345,
    write() {},
    onData() { return { dispose() {} }; },
    onExit() { return { dispose() {} }; },
    kill() {},
    resize() {},
  };
}

describe('AgentPTY provider dispatch', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortextos-agent-pty-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeEnv = (): CtxEnv => ({
    instanceId: 'test-instance',
    ctxRoot: tmpDir,
    frameworkRoot: tmpDir,
    agentName: 'test-agent',
    agentDir: tmpDir,
    org: 'test-org',
    projectRoot: tmpDir,
  });

  it('spawns claude binary when provider is unset (default anthropic)', async () => {
    const config: AgentConfig = { model: 'claude-sonnet-4-6' };
    const pty = new AgentPTY(makeEnv(), config);

    let capturedCmd = '';
    let capturedArgs: string[] = [];
    (pty as unknown as { spawnFn: unknown }).spawnFn = (cmd: string, args: string[]) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return makeFakePty();
    };

    await pty.spawn('fresh', 'hello');

    expect(capturedCmd === 'claude' || capturedCmd === 'claude.cmd').toBe(true);
    expect(capturedArgs).toContain('--dangerously-skip-permissions');
    expect(capturedArgs).toContain('--model');
    expect(capturedArgs).toContain('claude-sonnet-4-6');
    expect(capturedArgs[capturedArgs.length - 1]).toBe('hello');
  });

  it('spawns codex binary when provider is openai', async () => {
    const config: AgentConfig = { provider: 'openai', model: 'gpt-5.3-codex' };
    const pty = new AgentPTY(makeEnv(), config);

    let capturedCmd = '';
    let capturedArgs: string[] = [];
    (pty as unknown as { spawnFn: unknown }).spawnFn = (cmd: string, args: string[]) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return makeFakePty();
    };

    await pty.spawn('fresh', 'hola');

    expect(capturedCmd === 'codex' || capturedCmd === 'codex.cmd').toBe(true);
    expect(capturedArgs).toContain('--sandbox');
    expect(capturedArgs).toContain('danger-full-access');
    expect(capturedArgs).toContain('--model');
    expect(capturedArgs).toContain('gpt-5.3-codex');
    expect(capturedArgs[capturedArgs.length - 1]).toBe('hola');
  });

  it('openai continue mode: emits resume --last', async () => {
    const config: AgentConfig = { provider: 'openai', model: 'gpt-5.3-codex' };
    const pty = new AgentPTY(makeEnv(), config);

    let capturedArgs: string[] = [];
    (pty as unknown as { spawnFn: unknown }).spawnFn = (_cmd: string, args: string[]) => {
      capturedArgs = args;
      return makeFakePty();
    };

    await pty.spawn('continue', 'resumed');

    expect(capturedArgs[0]).toBe('resume');
    expect(capturedArgs[1]).toBe('--last');
  });

  it('anthropic continue mode: emits --continue', async () => {
    const config: AgentConfig = { provider: 'anthropic' };
    const pty = new AgentPTY(makeEnv(), config);

    let capturedArgs: string[] = [];
    (pty as unknown as { spawnFn: unknown }).spawnFn = (_cmd: string, args: string[]) => {
      capturedArgs = args;
      return makeFakePty();
    };

    await pty.spawn('continue', 'resumed');

    expect(capturedArgs[0]).toBe('--continue');
  });
});
