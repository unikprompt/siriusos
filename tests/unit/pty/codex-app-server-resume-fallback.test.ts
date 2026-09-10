import { describe, it, expect, vi, beforeEach } from 'vitest';

// C2: a thread/resume failure (notably the app-server -32601 paginated_threads
// not supported, or a thread too large to resume) must fall back to a FRESH
// thread instead of throwing. A thrown resume wedged the analista for two days:
// it retried the same dead 20.4M-token thread on every injection and went mute.
// See reference_codex_persistent_pty_resume_wedge.

const fsMocks = {
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  appendFileSync: vi.fn(),
};
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    get existsSync() { return fsMocks.existsSync; },
    get readFileSync() { return fsMocks.readFileSync; },
    get writeFileSync() { return fsMocks.writeFileSync; },
    get unlinkSync() { return fsMocks.unlinkSync; },
    get appendFileSync() { return fsMocks.appendFileSync; },
  };
});
vi.mock('../../../src/utils/atomic.js', () => ({ ensureDir: vi.fn(), atomicWriteSync: vi.fn() }));
vi.mock('node-pty', () => ({ spawn: vi.fn() }));

const requestMock = vi.fn();
vi.mock('../../../src/utils/ws-unix-client.js', () => ({
  WsUnixJsonRpcClient: vi.fn().mockImplementation(function WsUnixJsonRpcClient() {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      notify: vi.fn(),
      respondError: vi.fn(),
      onMessage: vi.fn().mockReturnValue(vi.fn()),
      request: requestMock,
    };
  }),
}));
vi.mock('../../../src/bus/event.js', () => ({ logEvent: vi.fn() }));

const { CodexAppServerPTY } = await import('../../../src/pty/codex-app-server-pty.js');

const mockEnv = {
  instanceId: 'test',
  ctxRoot: '/tmp/ctx',
  frameworkRoot: '/tmp/fw',
  agentName: 'codex-app-agent',
  agentDir: '/tmp/fw/orgs/acme/agents/codex-app-agent',
  org: 'acme',
  projectRoot: '/tmp/fw',
};

const THREAD_STATE_FILE = 'codex-app-server-thread.json';
const CWD = '/tmp/work';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePty(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pty = new CodexAppServerPTY(mockEnv, {}) as any;
  pty._rpc = { request: requestMock, respondError: vi.fn() };
  pty._cwd = CWD;
  return pty;
}
function methodsCalled(): string[] {
  return requestMock.mock.calls.map((c: unknown[]) => c[0] as string);
}
function persistedThread(threadId: string) {
  fsMocks.existsSync.mockImplementation((p: unknown) => String(p).endsWith(THREAD_STATE_FILE));
  fsMocks.readFileSync.mockImplementation((p: unknown) =>
    String(p).endsWith(THREAD_STATE_FILE) ? JSON.stringify({ threadId, cwd: CWD }) : '');
}

beforeEach(() => {
  fsMocks.existsSync.mockReset().mockReturnValue(false);
  fsMocks.readFileSync.mockReset();
  fsMocks.writeFileSync.mockReset();
  fsMocks.unlinkSync.mockReset();
  fsMocks.appendFileSync.mockReset();
  requestMock.mockReset();
});

describe('CodexAppServerPTY resume fallback (C2)', () => {
  it('POSITIVE: persisted resume -32601 -> clears thread, starts fresh, logs dead+new thread', async () => {
    persistedThread('dead-thread');
    requestMock.mockImplementation((method: string) => {
      if (method === 'thread/resume') {
        return Promise.reject(new Error('thread/resume failed: paginated_threads is not supported yet (code -32601)'));
      }
      if (method === 'thread/start') return Promise.resolve({ result: { thread: { id: 'fresh-1' } } });
      return Promise.resolve({ result: {} }); // thread/list -> no latest
    });
    const pty = makePty();
    await pty.startOrResumeThread('continue');

    expect(methodsCalled()).toContain('thread/resume');
    expect(methodsCalled()).toContain('thread/start'); // fell back to fresh
    expect(pty._threadId).toBe('fresh-1');
    expect(fsMocks.unlinkSync).toHaveBeenCalled();     // persisted thread cleared
    const out = pty.getOutputBuffer().getRecent();
    expect(out).toContain('resume failed (-32601) for thread dead-thread');
    expect(out).toContain('fresh thread started: fresh-1');
  });

  it('POSITIVE: latest-for-cwd resume -32601 (the line-542 wedge route) also falls back to fresh', async () => {
    fsMocks.existsSync.mockReturnValue(false); // no persisted thread
    requestMock.mockImplementation((method: string) => {
      if (method === 'thread/list') return Promise.resolve({ result: { data: [{ id: 'latest-dead', cwd: CWD }] } });
      if (method === 'thread/resume') {
        return Promise.reject(new Error('paginated_threads is not supported yet (code -32601)'));
      }
      if (method === 'thread/start') return Promise.resolve({ result: { thread: { id: 'fresh-2' } } });
      return Promise.resolve({ result: {} });
    });
    const pty = makePty();
    await pty.startOrResumeThread('continue');

    expect(methodsCalled()).toEqual(expect.arrayContaining(['thread/list', 'thread/resume', 'thread/start']));
    expect(pty._threadId).toBe('fresh-2');
    expect(pty.getOutputBuffer().getRecent()).toContain('resume failed (-32601) for thread latest-dead');
  });

  it('NEGATIVE (persisted route): resume OK -> NO fresh thread started', async () => {
    persistedThread('good-thread');
    requestMock.mockImplementation((method: string) => {
      if (method === 'thread/resume') return Promise.resolve({ result: { thread: { id: 'good-thread' } } });
      return Promise.resolve({ result: {} });
    });
    const pty = makePty();
    await pty.startOrResumeThread('continue');

    expect(methodsCalled()).toContain('thread/resume');
    expect(methodsCalled()).not.toContain('thread/start'); // resumed, did NOT start fresh
    expect(pty._threadId).toBe('good-thread');
    expect(fsMocks.unlinkSync).not.toHaveBeenCalled();
  });

  it('NEGATIVE (line-542 latest-for-cwd route): continue-mode resume OK -> NO fresh thread started', async () => {
    fsMocks.existsSync.mockReturnValue(false); // no persisted thread
    requestMock.mockImplementation((method: string) => {
      if (method === 'thread/list') return Promise.resolve({ result: { data: [{ id: 'latest-1', cwd: CWD }] } });
      if (method === 'thread/resume') return Promise.resolve({ result: { thread: { id: 'latest-1' } } });
      return Promise.resolve({ result: {} });
    });
    const pty = makePty();
    await pty.startOrResumeThread('continue');

    expect(methodsCalled()).toContain('thread/list');
    expect(methodsCalled()).toContain('thread/resume');
    expect(methodsCalled()).not.toContain('thread/start'); // latest resumed, did NOT start fresh
    expect(pty._threadId).toBe('latest-1');
  });
});
