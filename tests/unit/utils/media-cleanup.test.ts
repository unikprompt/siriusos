import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, utimesSync, existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { cleanupOldMedia } from '../../../src/utils/media-cleanup';

describe('cleanupOldMedia', () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `media-cleanup-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeWithAge(name: string, ageMs: number): string {
    const full = join(dir, name);
    writeFileSync(full, 'x');
    const past = (Date.now() - ageMs) / 1000;
    utimesSync(full, past, past);
    return full;
  }

  it('removes media files older than maxAgeMs and keeps recent ones', () => {
    const oldOgg = writeWithAge('voice_old.ogg', 48 * 60 * 60 * 1000);
    const oldJpg = writeWithAge('photo_old.jpg', 36 * 60 * 60 * 1000);
    const fresh = writeWithAge('voice_fresh.ogg', 60 * 1000);

    const result = cleanupOldMedia(dir, 24 * 60 * 60 * 1000);

    expect(result.removed).toBe(2);
    expect(existsSync(oldOgg)).toBe(false);
    expect(existsSync(oldJpg)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it('ignores non-media files (.txt, .json, .log)', () => {
    const txt = writeWithAge('notes.txt', 48 * 60 * 60 * 1000);
    const json = writeWithAge('manifest.json', 48 * 60 * 60 * 1000);

    const result = cleanupOldMedia(dir, 24 * 60 * 60 * 1000);

    expect(result.removed).toBe(0);
    expect(existsSync(txt)).toBe(true);
    expect(existsSync(json)).toBe(true);
  });

  it('handles missing directory without throwing', () => {
    rmSync(dir, { recursive: true, force: true });
    expect(() => cleanupOldMedia(dir, 1000)).not.toThrow();
    const result = cleanupOldMedia(dir, 1000);
    expect(result.removed).toBe(0);
  });

  it('covers all supported extensions', () => {
    const exts = ['.ogg', '.wav', '.jpg', '.jpeg', '.png', '.mp4', '.mov'];
    for (let i = 0; i < exts.length; i++) {
      writeWithAge(`file_${i}${exts[i]}`, 48 * 60 * 60 * 1000);
    }
    const result = cleanupOldMedia(dir, 24 * 60 * 60 * 1000);
    expect(result.removed).toBe(exts.length);
    expect(readdirSync(dir).length).toBe(0);
  });

  it('returns scanned count even when nothing is removed', () => {
    writeWithAge('fresh.jpg', 60 * 1000);
    writeWithAge('also-fresh.png', 60 * 1000);
    const result = cleanupOldMedia(dir, 24 * 60 * 60 * 1000);
    expect(result.scanned).toBe(2);
    expect(result.removed).toBe(0);
  });
});
