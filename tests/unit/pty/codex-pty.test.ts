import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMocks = {
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
};

const atomicMocks = {
  atomicWriteSync: vi.fn(),
};

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    get existsSync() { return fsMocks.existsSync; },
    get writeFileSync() { return fsMocks.writeFileSync; },
  };
});

// Stub node-pty so CodexPTY can be imported without a native addon
vi.mock('node-pty', () => ({
  spawn: vi.fn().mockReturnValue({
    pid: 77,
    write: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    kill: vi.fn(),
  }),
}));

vi.mock('../../../src/utils/atomic.js', () => ({
  atomicWriteSync: atomicMocks.atomicWriteSync,
}));

const { CodexPTY } = await import('../../../src/pty/codex-pty.js');

const mockEnv = {
  instanceId: 'test',
  ctxRoot: '/tmp/ctx',
  frameworkRoot: '/tmp/fw',
  agentName: 'codex-agent',
  agentDir: '/tmp/fw/orgs/acme/agents/codex-agent',
  org: 'acme',
  projectRoot: '/tmp/fw',
};

beforeEach(() => {
  fsMocks.existsSync.mockReset().mockReturnValue(false);
  fsMocks.writeFileSync.mockReset();
  atomicMocks.atomicWriteSync.mockReset();
});

describe('CodexPTY typing-indicator wiring (issue #330)', () => {
  function makeStubApi() {
    return { sendChatAction: vi.fn().mockResolvedValue(undefined) };
  }
  function makeTelegramTurnPty(api: ReturnType<typeof makeStubApi>) {
    const pty = new CodexPTY(mockEnv, {});
    pty.setTelegramHandle(api as unknown as Parameters<typeof pty.setTelegramHandle>[0], '12345');
    // Simulate a Telegram-initiated turn (set by write() when the message
    // arrives with the "=== TELEGRAM from " header).
    (pty as unknown as { _currentTurnFromTelegram: boolean })._currentTurnFromTelegram = true;
    return pty;
  }

  it('does not fire sendChatAction when no Telegram handle is set', () => {
    const pty = new CodexPTY(mockEnv, {});
    (pty as unknown as { _currentTurnFromTelegram: boolean })._currentTurnFromTelegram = true;
    // No setTelegramHandle call → maybeFireTyping must be a no-op
    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();
    expect(true).toBe(true); // no throw, no API call possible
  });

  it('fires sendChatAction once on a non-completion JSONL event', () => {
    const api = makeStubApi();
    const pty = makeTelegramTurnPty(api);

    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();

    expect(api.sendChatAction).toHaveBeenCalledTimes(1);
    expect(api.sendChatAction).toHaveBeenCalledWith('12345', 'typing');
  });

  it('rate-limits sendChatAction to one call per 4s', () => {
    const api = makeStubApi();
    const pty = makeTelegramTurnPty(api);

    // Three rapid back-to-back fires inside the 4s window
    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();
    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();
    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();

    expect(api.sendChatAction).toHaveBeenCalledTimes(1);
  });

  it('fires again after the 4s window elapses', () => {
    const api = makeStubApi();
    const pty = makeTelegramTurnPty(api);

    // Force first fire's timestamp into the past by reaching into the field.
    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();
    expect(api.sendChatAction).toHaveBeenCalledTimes(1);

    // Roll the rate-limit clock back by 5s to simulate elapsed wall time.
    (pty as unknown as { _typingLastSent: number })._typingLastSent = Date.now() - 5000;
    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();
    expect(api.sendChatAction).toHaveBeenCalledTimes(2);
  });

  it('swallows sendChatAction rejections silently (non-fatal)', async () => {
    const pty = new CodexPTY(mockEnv, {});
    const api = { sendChatAction: vi.fn().mockRejectedValue(new Error('429 Too Many Requests')) };
    pty.setTelegramHandle(api as unknown as Parameters<typeof pty.setTelegramHandle>[0], '12345');
    (pty as unknown as { _currentTurnFromTelegram: boolean })._currentTurnFromTelegram = true;

    // Must not throw
    expect(() => (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping()).not.toThrow();
    // Allow the rejected promise to settle so vitest doesn't flag an unhandled rejection
    await new Promise((r) => setTimeout(r, 0));
    expect(api.sendChatAction).toHaveBeenCalled();
  });

  it('does NOT fire when the current turn was not initiated by a Telegram message', () => {
    const pty = new CodexPTY(mockEnv, {});
    const api = makeStubApi();
    pty.setTelegramHandle(api as unknown as Parameters<typeof pty.setTelegramHandle>[0], '12345');
    // _currentTurnFromTelegram defaults to false — represents a cron / agent-
    // message-initiated turn.

    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();
    (pty as unknown as { maybeFireTyping(): void }).maybeFireTyping();

    expect(api.sendChatAction).not.toHaveBeenCalled();
  });

  it('write() marks the turn as Telegram when the buffer starts with "=== TELEGRAM from "', () => {
    const pty = new CodexPTY(mockEnv, {});
    (pty as unknown as { _alive: boolean })._alive = true;
    (pty as unknown as { queueExec(content: string): void }).queueExec = vi.fn();

    pty.write('=== TELEGRAM from Mario (chat_id:12345) ===\nHola\nReply using: ...');
    pty.write('\r');

    expect((pty as unknown as { _currentTurnFromTelegram: boolean })._currentTurnFromTelegram).toBe(true);
  });

  it('write() leaves the flag false for AGENT MESSAGE injections', () => {
    const pty = new CodexPTY(mockEnv, {});
    (pty as unknown as { _alive: boolean })._alive = true;
    (pty as unknown as { queueExec(content: string): void }).queueExec = vi.fn();

    pty.write('=== AGENT MESSAGE from orquestador [msg_id: abc] ===\nNueva tarea...');
    pty.write('\r');

    expect((pty as unknown as { _currentTurnFromTelegram: boolean })._currentTurnFromTelegram).toBe(false);
  });

  it('write() leaves the flag false for [CRON FIRED ...] injections', () => {
    const pty = new CodexPTY(mockEnv, {});
    (pty as unknown as { _alive: boolean })._alive = true;
    (pty as unknown as { queueExec(content: string): void }).queueExec = vi.fn();

    pty.write('[CRON FIRED 2026-05-15T22:44:00Z] heartbeat: Read HEARTBEAT.md ...');
    pty.write('\r');

    expect((pty as unknown as { _currentTurnFromTelegram: boolean })._currentTurnFromTelegram).toBe(false);
  });
});

describe('CodexPTY bootstrap pattern', () => {
  it('isBootstrapped() fires on thread.started JSONL', () => {
    const pty = new CodexPTY(mockEnv, {});
    pty.getOutputBuffer().push('{"type":"thread.started","id":"abc"}\n');
    expect(pty.getOutputBuffer().isBootstrapped()).toBe(true);
  });

  it('isBootstrapped() stays false on unrelated output', () => {
    const pty = new CodexPTY(mockEnv, {});
    pty.getOutputBuffer().push('loading codex...\n');
    expect(pty.getOutputBuffer().isBootstrapped()).toBe(false);
  });
});

describe('CodexPTY sandbox config', () => {
  // Reach into the private buildFreshArgs via cast for unit-test inspection.
  // Public API doesn't expose the args, but the contract is stable enough
  // (these are CLI flags forwarded to `codex exec`) that direct field access
  // is the right level for these tests.
  type FreshArgsPty = { buildFreshArgs(prompt: string): string[] };
  function readFreshArgs(pty: unknown): string[] {
    return (pty as FreshArgsPty).buildFreshArgs('hello');
  }

  it('defaults to danger-full-access when codex_sandbox is unset', () => {
    const pty = new CodexPTY(mockEnv, {});
    const args = readFreshArgs(pty);
    const idx = args.indexOf('--sandbox');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('danger-full-access');
  });

  it('honors codex_sandbox when set to a valid level', () => {
    const pty = new CodexPTY(mockEnv, { codex_sandbox: 'workspace-write' } as never);
    const args = readFreshArgs(pty);
    const idx = args.indexOf('--sandbox');
    expect(args[idx + 1]).toBe('workspace-write');
  });

  it('falls back to danger-full-access when codex_sandbox is invalid (typo guard)', () => {
    const pty = new CodexPTY(mockEnv, { codex_sandbox: 'workspace_write' } as never);
    const args = readFreshArgs(pty);
    const idx = args.indexOf('--sandbox');
    expect(args[idx + 1]).toBe('danger-full-access');
  });

  it('accepts read-only as a valid level', () => {
    const pty = new CodexPTY(mockEnv, { codex_sandbox: 'read-only' } as never);
    const args = readFreshArgs(pty);
    const idx = args.indexOf('--sandbox');
    expect(args[idx + 1]).toBe('read-only');
  });
});

describe('CodexPTY model arg', () => {
  type ArgsPty = {
    buildFreshArgs(prompt: string): string[];
    buildResumeArgs(prompt: string): string[];
  };
  function readFresh(pty: unknown): string[] {
    return (pty as ArgsPty).buildFreshArgs('hi');
  }
  function readResume(pty: unknown): string[] {
    return (pty as ArgsPty).buildResumeArgs('hi');
  }

  it('omits --model when config.model is unset (CLI default wins)', () => {
    const pty = new CodexPTY(mockEnv, {});
    expect(readFresh(pty)).not.toContain('--model');
    expect(readResume(pty)).not.toContain('--model');
  });

  it('omits --model when config.model is an empty string', () => {
    const pty = new CodexPTY(mockEnv, { model: '' } as never);
    expect(readFresh(pty)).not.toContain('--model');
    expect(readResume(pty)).not.toContain('--model');
  });

  it('threads --model into buildFreshArgs when config.model is set', () => {
    const pty = new CodexPTY(mockEnv, { model: 'gpt-5.3-codex' } as never);
    const args = readFresh(pty);
    const idx = args.indexOf('--model');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('gpt-5.3-codex');
  });

  it('threads --model into buildResumeArgs when config.model is set', () => {
    const pty = new CodexPTY(mockEnv, { model: 'gpt-5-high' } as never);
    const args = readResume(pty);
    const idx = args.indexOf('--model');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('gpt-5-high');
  });

  it('only one --model pair appears (no duplicate flags)', () => {
    const pty = new CodexPTY(mockEnv, { model: 'gpt-5-mini' } as never);
    const args = readFresh(pty);
    const occurrences = args.filter((a) => a === '--model').length;
    expect(occurrences).toBe(1);
  });

  it('preserves the prompt as the final positional after --model', () => {
    const pty = new CodexPTY(mockEnv, { model: 'gpt-5.3-codex' } as never);
    const args = readFresh(pty);
    expect(args[args.length - 1]).toBe('hi');
  });
});

describe('CodexPTY reasoning effort arg', () => {
  type ArgsPty = {
    buildFreshArgs(prompt: string): string[];
    buildResumeArgs(prompt: string): string[];
  };

  it('passes configured effort to fresh and resumed execs', () => {
    const pty = new CodexPTY(mockEnv, { reasoning_effort: 'high' });
    const fresh = (pty as unknown as ArgsPty).buildFreshArgs('hi');
    const resume = (pty as unknown as ArgsPty).buildResumeArgs('hi');
    expect(fresh).toContain('model_reasoning_effort=high');
    expect(resume).toContain('model_reasoning_effort=high');
  });

  it('omits an invalid runtime value defensively', () => {
    const pty = new CodexPTY(mockEnv, { reasoning_effort: 'turbo' } as never);
    const args = (pty as unknown as ArgsPty).buildFreshArgs('hi');
    expect(args.some((arg) => arg.startsWith('model_reasoning_effort='))).toBe(false);
  });
});

describe('CodexPTY exec JSONL context telemetry', () => {
  type TelemetryPty = {
    processJsonlChunk(data: string): void;
    readLastRolloutUsage(threadId: string): unknown;
  };

  function telemetry(pty: CodexPTY): TelemetryPty {
    return pty as unknown as TelemetryPty;
  }

  function mockRollout(pty: CodexPTY, overrides: Record<string, number | null> = {}): void {
    telemetry(pty).readLastRolloutUsage = vi.fn().mockReturnValue({
      inputTokens: 40000,
      outputTokens: 1000,
      cachedInputTokens: 30000,
      totalTokens: 41000,
      contextWindow: 100000,
      cumulativeInputTokens: 900000,
      cumulativeOutputTokens: 20000,
      cumulativeCachedInputTokens: 800000,
      ...overrides,
    });
  }

  it('writes context from rollout last_token_usage', () => {
    const pty = new CodexPTY(mockEnv, { codex_context_cap: 100000 });
    mockRollout(pty);
    telemetry(pty).processJsonlChunk('{"type":"thread.started","thread_id":"thread-a"}\n');
    telemetry(pty).processJsonlChunk('{"type":"turn.completed","usage":{"input_tokens":900000,"cached_input_tokens":800000,"output_tokens":20000}}\n');

    expect(atomicMocks.atomicWriteSync).toHaveBeenCalledTimes(1);
    const [, raw] = atomicMocks.atomicWriteSync.mock.calls[0] as [string, string];
    const status = JSON.parse(raw);
    expect(status.session_id).toBe('thread-a');
    expect(status.used_percentage).toBe(41);
    expect(status.current_usage.input_tokens).toBe(40000);
  });

  it('never treats turn.completed cumulative usage as context size', () => {
    const pty = new CodexPTY(mockEnv, { codex_context_cap: 100000 });
    mockRollout(pty, {
      inputTokens: 65000,
      outputTokens: 1000,
      cachedInputTokens: 55000,
      totalTokens: 66000,
      cumulativeInputTokens: 5000000,
      cumulativeOutputTokens: 100000,
    });
    telemetry(pty).processJsonlChunk('{"type":"thread.started","thread_id":"thread-b"}\n');
    telemetry(pty).processJsonlChunk('{"type":"turn.completed","usage":{"input_tokens":5000000,"cached_input_tokens":4500000,"output_tokens":100000}}\n');

    const [, raw] = atomicMocks.atomicWriteSync.mock.calls[0] as [string, string];
    const status = JSON.parse(raw);
    expect(status.used_percentage).toBe(66);
    expect(status.current_usage.input_tokens).toBe(65000);
    expect(status.current_usage.output_tokens).toBe(1000);
    expect(status.current_usage.cache_read_input_tokens).toBe(55000);
    expect(status.cumulative_usage.input_tokens).toBe(5000000);
  });

  it('handles JSONL split across PTY chunks', () => {
    const pty = new CodexPTY(mockEnv, { codex_context_cap: 100000 });
    mockRollout(pty);
    telemetry(pty).processJsonlChunk('{"type":"thread.started","thread_');
    telemetry(pty).processJsonlChunk('id":"thread-c"}\n{"type":"turn.completed","usage":{"input_tokens":10000,');
    telemetry(pty).processJsonlChunk('"cached_input_tokens":8000,"output_tokens":500}}\n');
    expect(atomicMocks.atomicWriteSync).toHaveBeenCalledTimes(1);
  });
});

describe('CodexPTY per-turn pty cleanup (BUG-PTY-LEAK)', () => {
  // A controllable mock pty: captures the onExit callback CodexPTY registers
  // and exposes spies for kill()/dispose() so we can assert the master fd is
  // released exactly once per turn. Disposing the subscriptions is not enough
  // to free the master fd — only pty.kill() does — so kill() must run exactly
  // once on every exit path (normal, error, mid-turn cancel) and never twice.
  function makeControllablePty() {
    let onExitCb: ((e: { exitCode: number; signal?: number }) => void) | undefined;
    const kill = vi.fn();
    const dataDispose = vi.fn();
    const exitDispose = vi.fn();
    const pty = {
      pid: 4321,
      write: vi.fn(),
      onData: vi.fn(() => ({ dispose: dataDispose })),
      onExit: vi.fn((cb: (e: { exitCode: number; signal?: number }) => void) => {
        onExitCb = cb;
        return { dispose: exitDispose };
      }),
      kill,
    };
    return {
      pty,
      kill,
      dataDispose,
      exitDispose,
      fireExit: (exitCode = 0) => onExitCb?.({ exitCode }),
    };
  }

  function startTurn(mock: ReturnType<typeof makeControllablePty>) {
    const pty = new CodexPTY(mockEnv, {});
    // Inject the controllable pty as the spawn result so runExec never touches
    // a native addon.
    (pty as unknown as { _spawnFn: () => unknown })._spawnFn = () => mock.pty;
    const done = (pty as unknown as { runExec(args: string[]): Promise<void> }).runExec(['exec', 'hi']);
    return { pty, done };
  }

  it('disposes and kills the pty exactly once on a normal turn exit', async () => {
    const mock = makeControllablePty();
    const { done } = startTurn(mock);

    mock.fireExit(0);
    await done;

    expect(mock.kill).toHaveBeenCalledTimes(1);
    expect(mock.dataDispose).toHaveBeenCalledTimes(1);
    expect(mock.exitDispose).toHaveBeenCalledTimes(1);
  });

  it('releases the pty exactly once on a non-zero (error) turn exit', async () => {
    const mock = makeControllablePty();
    const { done } = startTurn(mock);

    mock.fireExit(1);
    await done;

    expect(mock.kill).toHaveBeenCalledTimes(1);
    expect(mock.dataDispose).toHaveBeenCalledTimes(1);
    expect(mock.exitDispose).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when kill() cancels mid-turn and onExit fires late', async () => {
    const mock = makeControllablePty();
    const { pty, done } = startTurn(mock);

    // Class-level kill() mid-turn runs the cleanup (dispose + kill) and settles
    // the promise; a late onExit event must be a no-op, not a second kill.
    pty.kill();
    mock.fireExit(0);
    await done;

    expect(mock.kill).toHaveBeenCalledTimes(1);
    expect(mock.exitDispose).toHaveBeenCalledTimes(1);
  });

  it('does not double-kill when kill() is called after a normal exit', async () => {
    const mock = makeControllablePty();
    const { pty, done } = startTurn(mock);

    mock.fireExit(0);
    await done;
    // Redundant stop after the turn already cleaned up.
    pty.kill();

    expect(mock.kill).toHaveBeenCalledTimes(1);
  });
});
