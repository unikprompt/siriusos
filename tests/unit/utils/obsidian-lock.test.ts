import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { acquireFileLock, LockTimeoutError } from '../../../src/utils/obsidian-lock';

describe('acquireFileLock', () => {
  let ctxRoot: string;

  beforeEach(() => {
    ctxRoot = mkdtempSync(join(tmpdir(), 'obs-lock-ctx-'));
  });

  afterEach(() => {
    rmSync(ctxRoot, { recursive: true, force: true });
  });

  it('acquires and releases', () => {
    const handle = acquireFileLock(ctxRoot, '/some/vault/foo.md', 1000);
    expect(existsSync(handle.lockDir)).toBe(true);
    handle.release();
  });

  it('places lock outside the vault', () => {
    const vaultFile = '/vault/root/Projects/foo.md';
    const h = acquireFileLock(ctxRoot, vaultFile, 1000);
    expect(h.lockDir.startsWith(ctxRoot)).toBe(true);
    expect(h.lockDir).not.toContain('/vault/');
    h.release();
  });

  it('different files get different locks', () => {
    const a = acquireFileLock(ctxRoot, '/vault/a.md', 1000);
    const b = acquireFileLock(ctxRoot, '/vault/b.md', 1000);
    expect(a.lockDir).not.toBe(b.lockDir);
    a.release();
    b.release();
  });

  it('release allows re-acquire', () => {
    const path = '/vault/foo.md';
    const h1 = acquireFileLock(ctxRoot, path, 1000);
    h1.release();
    const h2 = acquireFileLock(ctxRoot, path, 1000);
    expect(h2.lockDir).toBe(h1.lockDir);
    h2.release();
  });
});
