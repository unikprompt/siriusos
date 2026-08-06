// Integration test for BUG-PTY-LEAK using REAL node-pty (no mock).
// node-pty 1.1.0 leaks one orphan pty (tty) fd in the parent per spawn().
// This test drives CodexPTY.runExec with a real node-pty spawning a harmless
// fast command and asserts the parent's tty-fd count does not grow across turns.
//
// It FAILS before the fix (each turn leaks ~1 tty fd) and PASSES after
// (closeSpawnOrphanTtyFds releases the orphan right after spawn).
//
// NB: this file intentionally does NOT mock node-pty — it needs the real addon
// and real /dev/fd, so it is macOS/Linux only.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { isatty } from 'tty';
import * as nodePty from 'node-pty';
import { CodexPTY } from '../../../src/pty/codex-pty.js';

const mockEnv = {
  instanceId: 'test',
  ctxRoot: '/tmp/ctx',
  frameworkRoot: '/tmp/fw',
  agentName: 'codex-agent',
  agentDir: '/tmp/fw/orgs/acme/agents/codex-agent',
  org: 'acme',
  projectRoot: '/tmp/fw',
};

function countTtyFds(): number {
  let n = 0;
  let entries: string[] = [];
  try { entries = readdirSync('/dev/fd'); } catch { return -1; }
  for (const e of entries) {
    const fd = Number(e);
    if (Number.isInteger(fd)) { try { if (isatty(fd)) n++; } catch { /* ignore */ } }
  }
  return n;
}

// Run a single real-node-pty "turn" through runExec (spawning /bin/sh instead
// of codex so no codex binary/auth is needed).
async function runRealTurn(pty: unknown): Promise<void> {
  (pty as { _spawnFn: unknown })._spawnFn = (_file: string, _args: string[], opts: Record<string, unknown>) =>
    nodePty.spawn('/bin/sh', ['-c', 'echo hi'], opts as never);
  await (pty as { runExec(a: string[]): Promise<void> }).runExec(['exec', 'hi']);
  // small settle so node-pty's internal 200ms socket-destroy timeout completes
  await new Promise((r) => setTimeout(r, 400));
}

describe('CodexPTY pty-fd leak (real node-pty, BUG-PTY-LEAK)', () => {
  it('runExec does not leak tty fds across turns', async () => {
    const pty = new CodexPTY(mockEnv as never, {});
    // warm up (first spawn allocates some stable fds)
    await runRealTurn(pty);
    const baseline = countTtyFds();
    expect(baseline).toBeGreaterThanOrEqual(0); // /dev/fd readable on this platform

    const TURNS = 6;
    for (let i = 0; i < TURNS; i++) { await runRealTurn(pty); }

    const after = countTtyFds();
    const growth = after - baseline;
    // With the leak, growth ≈ TURNS (one orphan tty fd per spawn). With the fix
    // it stays flat. Allow 1 for incidental noise.
    expect(growth).toBeLessThanOrEqual(1);
  }, 20000);
});
