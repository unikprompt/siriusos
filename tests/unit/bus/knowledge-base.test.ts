import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Path-aware fs mocks. existsSync is the one we actually drive per-test:
// it returns true for any path EXCEPT the MMRAG_CONFIG one (when the test
// wants to simulate a missing config) so loadSecretsEnv and other path
// lookups still work normally inside the module under test.
const fsMocks = {
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
};

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof fsMocks.existsSync>) => fsMocks.existsSync(...args),
    readFileSync: (...args: Parameters<typeof fsMocks.readFileSync>) => fsMocks.readFileSync(...args),
    mkdirSync: (...args: Parameters<typeof fsMocks.mkdirSync>) => fsMocks.mkdirSync(...args),
  };
});

// Mock execFileSync so we can assert whether it was called (and optionally
// simulate a successful python response).
const execFileSyncMock = vi.fn();
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
  };
});

// Mock normalizeOrgName to a passthrough identity — we are not testing org
// normalization here, that has its own dedicated test file.
vi.mock('../../../src/utils/org.js', () => ({
  normalizeOrgName: (_root: string, org: string) => org,
}));

const { queryKnowledgeBase, ingestKnowledgeBase } = await import('../../../src/bus/knowledge-base.js');

// Minimal BusPaths stub — knowledge-base.ts doesn't actually USE the paths
// object at call time, just the options/env it constructs.
const dummyPaths = {
  stateDir: '/tmp/agent/state',
  logDir: '/tmp/agent/logs',
  ctxRoot: '/tmp/agent',
  instanceId: 'test',
  agentName: 'tester',
  org: 'TestOrg',
  inboxDir: '/tmp/agent/inbox',
  inflightDir: '/tmp/agent/inflight',
  processedDir: '/tmp/agent/processed',
  outboxDir: '/tmp/agent/outbox',
} as any;

const baseOptions = {
  org: 'TestOrg',
  agent: 'tester',
  frameworkRoot: '/home/test/cortextOS',
  instanceId: 'test',
};

let warnLog: string[] = [];
let originalWarn: typeof console.warn;
let logLog: string[] = [];
let originalLog: typeof console.log;

beforeEach(() => {
  fsMocks.existsSync.mockReset();
  fsMocks.readFileSync.mockReset().mockReturnValue('');
  fsMocks.mkdirSync.mockReset();
  execFileSyncMock.mockReset();

  warnLog = [];
  logLog = [];
  originalWarn = console.warn;
  originalLog = console.log;
  console.warn = (...args: unknown[]) => {
    warnLog.push(args.map((a) => String(a)).join(' '));
  };
  console.log = (...args: unknown[]) => {
    logLog.push(args.map((a) => String(a)).join(' '));
  };
});

afterEach(() => {
  console.warn = originalWarn;
  console.log = originalLog;
});

/**
 * Helper: make existsSync return false ONLY for paths that end with
 * knowledge-base/config.json (i.e. the MMRAG_CONFIG file), true for everything
 * else. Simulates a freshly-created agent with no KB configured yet.
 */
function mockMissingKbConfig(): void {
  fsMocks.existsSync.mockImplementation((p: any) => {
    const path = String(p);
    if (path.endsWith('/knowledge-base/config.json')) return false;
    return true;
  });
}

/**
 * Helper: make existsSync return true for everything, simulating a fully
 * configured KB with config.json present on disk.
 */
function mockConfiguredKb(): void {
  fsMocks.existsSync.mockImplementation(() => true);
}

describe('ingestKnowledgeBase — graceful missing-config', () => {
  it('missing config: warn + return cleanly, execFileSync NEVER called', () => {
    mockMissingKbConfig();

    // Must NOT throw. Previously this path threw an unhandled execFileSync
    // error that dumped a Node stack trace on top of the python stderr.
    expect(() =>
      ingestKnowledgeBase(['/some/file.md'], baseOptions),
    ).not.toThrow();

    expect(execFileSyncMock).not.toHaveBeenCalled();
    // Warn must include the org name AND an actionable hint ("run setup").
    expect(warnLog.some((m) => m.includes('TestOrg') && /run setup/i.test(m))).toBe(true);
    // Warn must carry the [kb] prefix so operators can filter log lines.
    expect(warnLog.some((m) => m.includes('[kb]'))).toBe(true);
  });

  it('config present: execFileSync IS called with the mmrag ingest args', () => {
    mockConfiguredKb();
    execFileSyncMock.mockReturnValue('');

    ingestKnowledgeBase(['/some/file.md'], baseOptions);

    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    // First positional arg is the python path, second is the argv array.
    const [pythonPath, argv] = execFileSyncMock.mock.calls[0] as [string, string[], object];
    expect(String(pythonPath)).toMatch(/python/);
    expect(argv).toEqual(expect.arrayContaining(['ingest', '/some/file.md']));
    // Happy path emits no [kb] warning.
    expect(warnLog.filter((m) => m.includes('[kb]'))).toHaveLength(0);
  });

  it('ingest failure: mmrag exits non-zero → re-throw a clean error, never log "Ingest complete"', () => {
    mockConfiguredKb();
    // Simulate mmrag.py exiting non-zero (e.g. a Gemini 429 that exhausted
    // embedding credits): execFileSync throws an error carrying the exit code.
    const childErr = Object.assign(new Error('Command failed'), { status: 1 });
    execFileSyncMock.mockImplementation(() => {
      throw childErr;
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      // Must throw an actionable error, not swallow the failure — the previous
      // bug let this path fall through to an unconditional success log.
      expect(() => ingestKnowledgeBase(['/some/file.md'], baseOptions)).toThrow(
        /ingest failed for collection .* NOT up to date/i,
      );
      // The success line must NOT be printed when the child failed.
      const loggedComplete = logSpy.mock.calls
        .flat()
        .some((m) => String(m).includes('Ingest complete'));
      expect(loggedComplete).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('queryKnowledgeBase — graceful missing-config', () => {
  it('missing config: warn + return empty KBQueryResponse, execFileSync NEVER called', () => {
    mockMissingKbConfig();

    const result = queryKnowledgeBase(dummyPaths, 'what is cortextos?', baseOptions);

    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      results: [],
      total: 0,
      query: 'what is cortextos?',
      collection: 'shared-TestOrg',
    });
    expect(warnLog.some((m) => m.includes('TestOrg') && /run setup/i.test(m))).toBe(true);
    expect(warnLog.some((m) => m.includes('[kb]'))).toBe(true);
  });

  it('config present: execFileSync IS called, happy-path query returns results', () => {
    mockConfiguredKb();
    // Mock mmrag.py --json output: a JSON blob with one result.
    execFileSyncMock.mockReturnValue(
      JSON.stringify({
        results: [
          { content: 'hit', similarity: 0.9, source: 'foo.md', type: 'markdown' },
        ],
      }),
    );

    const result = queryKnowledgeBase(dummyPaths, 'test query', baseOptions);

    expect(execFileSyncMock).toHaveBeenCalled();
    expect(result.total).toBeGreaterThan(0);
    expect(result.results[0].content).toBe('hit');
    // Happy path emits no [kb] warning.
    expect(warnLog.filter((m) => m.includes('[kb]'))).toHaveLength(0);
  });
});

describe('queryKnowledgeBase — cross-collection merge by score', () => {
  // Return a distinct mmrag --json blob per collection, keyed off the
  // `--collection <name>` argv pair. Lets us simulate scope=all querying both
  // shared-${org} and agent-${agent} with different scores.
  function mockPerCollection(
    byCollection: Record<string, Array<{ content: string; similarity: number; source: string }>>,
  ): void {
    execFileSyncMock.mockImplementation((...args: unknown[]) => {
      const argv = (args[1] as string[]) || [];
      const ci = argv.indexOf('--collection');
      const col = ci >= 0 ? argv[ci + 1] : '';
      return JSON.stringify({ results: byCollection[col] || [] });
    });
  }

  it('scope=all: a higher-scored AGENT result outranks a lower-scored shared result (was buried at [6])', () => {
    mockConfiguredKb();
    mockPerCollection({
      'shared-TestOrg': [{ content: 'shared/trading hit', similarity: 0.63, source: 'shared-doc.md' }],
      'agent-tester': [{ content: 'my own memory', similarity: 0.674, source: 'agent-memory.md' }],
    });

    const result = queryKnowledgeBase(dummyPaths, 'q', { ...baseOptions, scope: 'all' });

    // Both collections queried, then merged by score (NOT concatenated shared-first).
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    expect(result.results.map((r) => r.score)).toEqual([0.674, 0.63]);
    expect(result.results[0].source_file).toBe('agent-memory.md');
  });

  it('score-based, not collection-based: a higher-scored SHARED result still ranks first', () => {
    // Negative marker: the fix is a score merge, not "always put the agent first".
    // When the shared corpus genuinely scores higher, it must stay on top.
    mockConfiguredKb();
    mockPerCollection({
      'shared-TestOrg': [{ content: 'strong shared hit', similarity: 0.72, source: 'shared-doc.md' }],
      'agent-tester': [{ content: 'weak memory', similarity: 0.50, source: 'agent-memory.md' }],
    });

    const result = queryKnowledgeBase(dummyPaths, 'q', { ...baseOptions, scope: 'all' });

    expect(result.results.map((r) => r.score)).toEqual([0.72, 0.50]);
    expect(result.results[0].source_file).toBe('shared-doc.md');
  });
});

describe('kb warn messages — UX invariants', () => {
  it('both warn messages name the org and suggest "run setup"', () => {
    // Drive ingest path
    mockMissingKbConfig();
    ingestKnowledgeBase(['/f.md'], { ...baseOptions, org: 'SpecificOrg' });
    // Drive query path
    mockMissingKbConfig();
    queryKnowledgeBase(dummyPaths, 'q', { ...baseOptions, org: 'SpecificOrg' });

    // At least one warn per call site, each containing the org name + hint
    const specificOrgWarns = warnLog.filter((m) => m.includes('SpecificOrg'));
    expect(specificOrgWarns.length).toBeGreaterThanOrEqual(2);
    expect(specificOrgWarns.every((m) => /run setup/i.test(m))).toBe(true);
  });
});
