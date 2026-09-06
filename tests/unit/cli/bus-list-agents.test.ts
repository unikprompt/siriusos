/**
 * tests/unit/cli/bus-list-agents.test.ts
 *
 * `siriusos bus list-agents` migrated to inventoryAgents(): the JSON output is
 * now an object { agents, inconsistencies }, real agents are those with a
 * config.json on disk, and registry-vs-disk drift is reported (a .DS_Store
 * registry entry no longer appears as an agent). Running-state is overlaid
 * from the daemon status IPC.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// IPC mock: the daemon reports `alice` running, so the overlay can be asserted.
const mockIpcSend = vi.fn(async (msg: { type: string }) => {
  if (msg.type === 'status') {
    return { success: true, data: [{ name: 'alice', status: 'running' }] };
  }
  return { success: true, data: [] };
});
vi.mock('../../../src/daemon/ipc-server.js', () => {
  class MockIPCClient {
    send = mockIpcSend;
    isDaemonRunning = vi.fn().mockResolvedValue(true);
  }
  return { IPCClient: MockIPCClient };
});

import { busCommand } from '../../../src/cli/bus';

describe('siriusos bus list-agents (migrated to inventoryAgents)', () => {
  let home: string;
  let framework: string;
  let ctxRoot: string;
  const origHome = process.env.HOME;
  const origFw = process.env.CTX_FRAMEWORK_ROOT;
  const origInstance = process.env.CTX_INSTANCE_ID;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'bus-la-home-'));
    framework = mkdtempSync(join(tmpdir(), 'bus-la-fw-'));
    process.env.HOME = home;
    process.env.CTX_INSTANCE_ID = 'default';
    process.env.CTX_FRAMEWORK_ROOT = framework;
    ctxRoot = join(home, '.siriusos', 'default');

    // Registry: a real agent (alice), a stale org for a real agent (director),
    // and pure noise (.DS_Store) that must NOT appear as an agent.
    mkdirSync(join(ctxRoot, 'config'), { recursive: true });
    writeFileSync(
      join(ctxRoot, 'config', 'enabled-agents.json'),
      JSON.stringify({
        alice: { org: 'acme', enabled: true },
        director: { org: 'acme', enabled: true }, // registry says acme; disk says other-org
        '.DS_Store': { enabled: true },            // filesystem noise
      }),
    );
    // Disk: config.json is the reality check.
    mkdirSync(join(framework, 'orgs', 'acme', 'agents', 'alice'), { recursive: true });
    writeFileSync(join(framework, 'orgs', 'acme', 'agents', 'alice', 'config.json'), JSON.stringify({ enabled: true }));
    mkdirSync(join(framework, 'orgs', 'other-org', 'agents', 'director'), { recursive: true });
    writeFileSync(join(framework, 'orgs', 'other-org', 'agents', 'director', 'config.json'), JSON.stringify({ enabled: true }));

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockIpcSend.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(home, { recursive: true, force: true });
    rmSync(framework, { recursive: true, force: true });
    if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
    if (origFw === undefined) delete process.env.CTX_FRAMEWORK_ROOT; else process.env.CTX_FRAMEWORK_ROOT = origFw;
    if (origInstance === undefined) delete process.env.CTX_INSTANCE_ID; else process.env.CTX_INSTANCE_ID = origInstance;
  });

  function runJson(): { agents: Array<Record<string, unknown>>; inconsistencies: Array<Record<string, unknown>> } {
    const out = logSpy.mock.calls.map(c => c[0]).join('\n');
    return JSON.parse(out);
  }

  it('outputs { agents, inconsistencies }; excludes .DS_Store; flags the org mismatch; overlays running', async () => {
    await busCommand.parseAsync(['node', 'bus', 'list-agents', '--format', 'json']);
    const parsed = runJson();

    // Object shape (was a bare array before the migration).
    expect(Array.isArray(parsed)).toBe(false);
    expect(Array.isArray(parsed.agents)).toBe(true);
    expect(Array.isArray(parsed.inconsistencies)).toBe(true);

    // .DS_Store is not an agent; alice and director (real, config.json) are.
    const names = parsed.agents.map(a => a.name).sort();
    expect(names).toEqual(['alice', 'director']);

    // director's org is disk truth (other-org), not the registry's 'acme'.
    const director = parsed.agents.find(a => a.name === 'director')!;
    expect(director.org).toBe('other-org');

    // Running overlaid from the daemon status IPC.
    const alice = parsed.agents.find(a => a.name === 'alice')!;
    expect(alice.running).toBe(true);
    expect(director.running).toBe(false);

    // Inconsistencies reported, not hidden: .DS_Store (missing_config) + director (org_mismatch).
    const kinds = parsed.inconsistencies.map(i => `${i.kind}:${i.name}`).sort();
    expect(kinds).toContain('missing_config:.DS_Store');
    expect(kinds).toContain('org_mismatch:director');
    expect(mockIpcSend).toHaveBeenCalled();
  });

  it('--status running narrows agents but keeps the full inconsistencies report', async () => {
    await busCommand.parseAsync(['node', 'bus', 'list-agents', '--format', 'json', '--status', 'running']);
    const parsed = runJson();
    expect(parsed.agents.map(a => a.name)).toEqual(['alice']); // only the running one
    // inconsistencies are a data-quality report, not filtered by run status
    expect(parsed.inconsistencies.some(i => i.name === '.DS_Store')).toBe(true);
  });
});
