import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// The duplicate-name bug depended on filesystem readdir order: `analista` exists
// in both orgs/sirius-consul (an on-demand homonym, disabled) and orgs/unikprompt
// (ours, enabled), and the old code took whichever org readdir returned first.
// This mock PINS that order to sirius-consul BEFORE unikprompt so the wedge is
// reproduced deterministically on every platform — otherwise the test passed on
// Linux and failed on this Mac (or vice versa). Everything else is the real fs.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const realReaddir = actual.readdirSync;
  const wrapped = ((p: unknown, opts?: unknown) => {
    const res = (realReaddir as (a: unknown, b?: unknown) => unknown)(p, opts);
    if (typeof p === 'string' && p.replace(/\/+$/, '').endsWith('/orgs') && Array.isArray(res)) {
      const rank = (n: unknown) => {
        const s = String(n);
        if (s === 'sirius-consul') return 0;
        if (s === 'unikprompt') return 1;
        return 2;
      };
      return [...(res as unknown[])].sort((a, b) => rank(a) - rank(b));
    }
    return res;
  }) as typeof actual.readdirSync;
  return { ...actual, readdirSync: wrapped };
});

import { inventoryAgents, classifyIdentity } from '../../../src/bus/agents';

describe('duplicate agent name across orgs (analista in unikprompt + sirius-consul)', () => {
  let testDir: string;
  let ctxRoot: string;
  const savedOrg = process.env.CTX_ORG;
  const savedFR = process.env.CTX_FRAMEWORK_ROOT;

  function makeAgent(org: string, name: string, config: Record<string, unknown>) {
    const dir = join(testDir, 'framework', 'orgs', org, 'agents', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  }
  function setRegistry(obj: Record<string, { org?: string; enabled?: boolean }>) {
    const configDir = join(ctxRoot, 'config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'enabled-agents.json'), JSON.stringify(obj));
  }

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'dup-name-'));
    ctxRoot = join(testDir, 'ctx');
    mkdirSync(ctxRoot, { recursive: true });
    process.env.CTX_FRAMEWORK_ROOT = join(testDir, 'framework');
    // Our analista: enabled under unikprompt. Sirius-Consul: a disabled homonym.
    // The registry (the daemon's) knows ours is unikprompt.
    makeAgent('sirius-consul', 'analista', { enabled: false });
    makeAgent('unikprompt', 'analista', { enabled: true });
    setRegistry({ analista: { org: 'unikprompt', enabled: true } });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    if (savedOrg === undefined) delete process.env.CTX_ORG; else process.env.CTX_ORG = savedOrg;
    if (savedFR === undefined) delete process.env.CTX_FRAMEWORK_ROOT; else process.env.CTX_FRAMEWORK_ROOT = savedFR;
  });

  it('the readdir mock really returns sirius-consul before unikprompt (guards the reproduction)', async () => {
    const fs = await import('fs');
    const orgs = fs.readdirSync(join(testDir, 'framework', 'orgs')) as unknown as string[];
    expect(orgs.indexOf('sirius-consul')).toBeLessThan(orgs.indexOf('unikprompt'));
  });

  it("classifyIdentity keys on (CTX_ORG, name): our analista is 'registered', not the homonym's 'disabled'", () => {
    process.env.CTX_ORG = 'unikprompt';
    expect(classifyIdentity('analista', ctxRoot)).toBe('registered');
  });

  it('classifyIdentity falls back to the registry org when CTX_ORG is unset', () => {
    delete process.env.CTX_ORG;
    expect(classifyIdentity('analista', ctxRoot)).toBe('registered');
  });

  it('inventoryAgents (no --org) resolves the duplicate by the registry org: one clean unikprompt entry, no false org/enabled mismatch', () => {
    delete process.env.CTX_ORG;
    const inv = inventoryAgents(ctxRoot);
    const entries = inv.agents.filter((a) => a.name === 'analista');
    expect(entries.length).toBe(1);
    expect(entries[0].org).toBe('unikprompt');
    expect(entries[0].enabled).toBe(true);
    expect(entries[0].inconsistencies).toBeUndefined();
    expect(inv.inconsistencies.filter((i) => i.name === 'analista')).toEqual([]);
  });

  it('inventoryAgents with --org unikprompt lists our analista cleanly', () => {
    const inv = inventoryAgents(ctxRoot, 'unikprompt');
    const entries = inv.agents.filter((a) => a.name === 'analista');
    expect(entries.length).toBe(1);
    expect(entries[0].org).toBe('unikprompt');
    expect(entries[0].inconsistencies).toBeUndefined();
  });

  it('inventoryAgents lists one entry per org when the registry has no home for a duplicate name', () => {
    setRegistry({}); // registry cannot pick a canonical org -> surface both, no false flags
    delete process.env.CTX_ORG;
    const inv = inventoryAgents(ctxRoot);
    const orgs = inv.agents.filter((a) => a.name === 'analista').map((a) => a.org).sort();
    expect(orgs).toEqual(['sirius-consul', 'unikprompt']);
    expect(inv.inconsistencies.filter((i) => i.name === 'analista' && i.kind === 'org_mismatch')).toEqual([]);
  });
});
