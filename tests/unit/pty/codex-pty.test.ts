import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMocks = {
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
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
