import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { transcribeVoice } from '../../../src/daemon/whisper-transcribe.js';

// We exercise the spawn pipeline against a stub `python3` (a small shell
// script) — no real whisper. This validates the JSON contract, the timeout
// path, the cleanup path, and the failure modes without pulling in the
// actual whisper dependency.
function makeStubPython(workDir: string, body: string): string {
  const path = join(workDir, 'stub-python.sh');
  writeFileSync(path, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  return path;
}

let workDir: string;
let logs: string[];

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'whisper-test-'));
  logs = [];
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('transcribeVoice', () => {
  it('returns null when source file does not exist', async () => {
    const result = await transcribeVoice(join(workDir, 'missing.ogg'), {
      log: (m) => logs.push(m),
    });

    expect(result).toBeNull();
    expect(logs.some((l) => l.includes('file not found'))).toBe(true);
  });

  it('returns transcript and deletes source on success', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake audio bytes');
    const stub = makeStubPython(workDir, `printf '{"text": "hola mundo"}'`);

    const result = await transcribeVoice(audio, {
      pythonBin: stub,
      log: (m) => logs.push(m),
    });

    expect(result).toBe('hola mundo');
    expect(existsSync(audio)).toBe(false);
    expect(logs.some((l) => l.includes('cleaned up'))).toBe(true);
  });

  it('preserves source file when cleanupOnSuccess=false', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake audio bytes');
    const stub = makeStubPython(workDir, `printf '{"text": "hola"}'`);

    const result = await transcribeVoice(audio, {
      pythonBin: stub,
      cleanupOnSuccess: false,
      log: (m) => logs.push(m),
    });

    expect(result).toBe('hola');
    expect(existsSync(audio)).toBe(true);
  });

  it('returns null on non-zero exit and keeps source file', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake');
    const stub = makeStubPython(workDir, `echo "boom" >&2; exit 1`);

    const result = await transcribeVoice(audio, {
      pythonBin: stub,
      log: (m) => logs.push(m),
    });

    expect(result).toBeNull();
    expect(existsSync(audio)).toBe(true);
    expect(logs.some((l) => l.includes('exit 1'))).toBe(true);
  });

  it('returns null on JSON parse failure', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake');
    const stub = makeStubPython(workDir, `printf 'not-json'`);

    const result = await transcribeVoice(audio, {
      pythonBin: stub,
      log: (m) => logs.push(m),
    });

    expect(result).toBeNull();
    expect(existsSync(audio)).toBe(true);
    expect(logs.some((l) => l.includes('parse error'))).toBe(true);
  });

  it('returns null on empty transcript and keeps source', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake');
    const stub = makeStubPython(workDir, `printf '{"text": "   "}'`);

    const result = await transcribeVoice(audio, {
      pythonBin: stub,
      log: (m) => logs.push(m),
    });

    expect(result).toBeNull();
    expect(existsSync(audio)).toBe(true);
    expect(logs.some((l) => l.includes('empty transcript'))).toBe(true);
  });

  it('kills long-running process on timeout and returns null', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake');
    // Stub sleeps 10s — well beyond our 200ms timeout.
    const stub = makeStubPython(workDir, `sleep 10; printf '{"text":"too late"}'`);

    const start = Date.now();
    const result = await transcribeVoice(audio, {
      pythonBin: stub,
      timeoutMs: 200,
      log: (m) => logs.push(m),
    });
    const elapsed = Date.now() - start;

    expect(result).toBeNull();
    expect(existsSync(audio)).toBe(true);
    expect(elapsed).toBeLessThan(2000); // timeout actually fired
    expect(logs.some((l) => l.includes('timeout'))).toBe(true);
  });

  it('returns null when python binary is missing entirely', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake');

    const result = await transcribeVoice(audio, {
      pythonBin: '/definitely/not/a/real/binary',
      log: (m) => logs.push(m),
    });

    expect(result).toBeNull();
    expect(existsSync(audio)).toBe(true);
  });

  it('trims whitespace around the transcript', async () => {
    const audio = join(workDir, 'voice.ogg');
    writeFileSync(audio, 'fake');
    const stub = makeStubPython(workDir, `printf '{"text": "  hola amigos  "}'`);

    const result = await transcribeVoice(audio, {
      pythonBin: stub,
      log: (m) => logs.push(m),
    });

    expect(result).toBe('hola amigos');
  });
});
