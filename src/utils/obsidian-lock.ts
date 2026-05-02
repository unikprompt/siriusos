import { createHash } from 'crypto';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { acquireLock, releaseLock } from './lock.js';

export interface LockHandle {
  lockDir: string;
  release(): void;
}

export class LockTimeoutError extends Error {
  code = 'lock_timeout';
}

/**
 * Acquire an advisory lock for a vault file, OUTSIDE the vault.
 * Lock dir lives at <ctxRoot>/state/locks/obsidian/<sha>/, never inside the vault
 * (avoids creating .lock.d entries that iCloud would sync across machines).
 *
 * Retries with 50ms backoff until timeoutMs elapses. Throws LockTimeoutError on timeout.
 */
export function acquireFileLock(
  ctxRoot: string,
  absoluteFilePath: string,
  timeoutMs: number = 5000,
): LockHandle {
  const sha = createHash('sha256').update(absoluteFilePath).digest('hex');
  const baseDir = join(ctxRoot, 'state', 'locks', 'obsidian');
  mkdirSync(baseDir, { recursive: true });
  const lockDir = join(baseDir, sha);
  mkdirSync(lockDir, { recursive: true });

  const start = Date.now();
  let acquired = acquireLock(lockDir);
  while (!acquired) {
    if (Date.now() - start >= timeoutMs) {
      throw new LockTimeoutError(`Could not acquire lock for ${absoluteFilePath} within ${timeoutMs}ms`);
    }
    sleepSync(50);
    acquired = acquireLock(lockDir);
  }

  return {
    lockDir,
    release() {
      releaseLock(lockDir);
    },
  };
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait — short by design (50ms slices)
  }
}
