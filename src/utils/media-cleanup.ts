/**
 * Background cleanup of accumulated Telegram media files in an agent's
 * `telegram-images/` directory.
 *
 * Voice .ogg files are removed inline after a successful transcription
 * (see src/telegram/media.ts), so this routine mainly sweeps photos that
 * agents already read with the Read tool but never get a chance to delete
 * themselves, plus the occasional voice file whose transcription failed
 * and was left behind days ago.
 */

import { readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

export interface MediaCleanupResult {
  removed: number;
  scanned: number;
  bytesFreed: number;
}

const MEDIA_EXTENSIONS = new Set(['.ogg', '.wav', '.jpg', '.jpeg', '.png', '.mp4', '.mov']);

/**
 * Remove media files in `dir` whose mtime is older than `maxAgeMs`.
 * Silent on individual file errors so a single permission issue does not
 * abort the whole sweep.
 */
export function cleanupOldMedia(
  dir: string,
  maxAgeMs: number,
  log: (msg: string) => void = () => {},
): MediaCleanupResult {
  const result: MediaCleanupResult = { removed: 0, scanned: 0, bytesFreed: 0 };
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }

  const now = Date.now();
  for (const name of entries) {
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf('.');
    if (dot === -1) continue;
    const ext = lower.slice(dot);
    if (!MEDIA_EXTENSIONS.has(ext)) continue;

    const fullPath = join(dir, name);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    result.scanned += 1;
    if (now - st.mtimeMs <= maxAgeMs) continue;

    try {
      unlinkSync(fullPath);
      result.removed += 1;
      result.bytesFreed += st.size;
    } catch {
      // ignore — next sweep will retry
    }
  }

  if (result.removed > 0) {
    log(
      `Media cleanup: removed ${result.removed}/${result.scanned} files older than ${Math.round(maxAgeMs / 3_600_000)}h (freed ${(result.bytesFreed / 1024).toFixed(1)} KB)`,
    );
  }
  return result;
}
