/**
 * Local Whisper transcription for Telegram voice/audio messages.
 *
 * Spawns `python3 -c <inline whisper>` with the audio path. The Python side
 * loads the configured model, transcribes in the configured language, and
 * prints a JSON object `{ "text": "..." }` to stdout.
 *
 * On success, the source file is deleted so the agent does not see a stale
 * `local_file:` path AND so audio does not accumulate on disk over the day
 * (per orquestador same-day cleanup directive).
 *
 * Failure modes (return null, leave the file in place):
 *   - python3 missing or whisper module not importable
 *   - file does not exist
 *   - process exits non-zero
 *   - timeout (default 60s) — process is SIGKILLed
 *   - empty transcript
 *   - JSON parse error on stdout
 *
 * The caller (fast-checker / agent-manager) treats null as "no transcript",
 * falls back to delivering `local_file:` so the agent can still listen.
 */
import { spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';

export interface TranscribeOptions {
  /** ISO-639-1 language hint passed to whisper. Default: 'es'. */
  language?: string;
  /** Whisper model name. Default: 'base'. */
  model?: string;
  /** Hard timeout for the python process in ms. Default: 60_000. */
  timeoutMs?: number;
  /** Logger; defaults to a no-op so this module is silent in tests. */
  log?: (msg: string) => void;
  /** Override `python3` binary (test-only). */
  pythonBin?: string;
  /**
   * If false, the source file is preserved after transcription. Default true.
   * The cleanup is part of the same-day disk-pressure mitigation, so production
   * callers should leave this as default.
   */
  cleanupOnSuccess?: boolean;
}

// Inline Python program. Keep it small — the daemon respawns this per voice
// message and any import failure surfaces as exit != 0.
const PY_PROGRAM = `import sys, os, json, warnings
warnings.filterwarnings("ignore")
import whisper
audio = sys.argv[1]
language = sys.argv[2] if len(sys.argv) > 2 else "es"
model_name = sys.argv[3] if len(sys.argv) > 3 else "base"
model = whisper.load_model(model_name)
result = model.transcribe(audio, language=language)
sys.stdout.write(json.dumps({"text": (result.get("text") or "").strip()}))
sys.stdout.flush()
`;

/**
 * Transcribe a voice/audio file using local whisper. Returns the transcript
 * (trimmed) on success, or null on any failure. On success the source file
 * is deleted unless `cleanupOnSuccess: false` is passed.
 */
export async function transcribeVoice(
  absolutePath: string,
  opts: TranscribeOptions = {},
): Promise<string | null> {
  const language = opts.language ?? 'es';
  const model = opts.model ?? 'base';
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const log = opts.log ?? (() => { /* silent default */ });
  const pythonBin = opts.pythonBin ?? 'python3';
  const cleanupOnSuccess = opts.cleanupOnSuccess ?? true;

  if (!existsSync(absolutePath)) {
    log(`whisper: file not found: ${absolutePath}`);
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const started = Date.now();
    // detached: true puts the child in its own process group. On timeout we
    // signal the whole group (process.kill(-pid)) so any python subprocesses
    // (whisper sometimes spawns ffmpeg) die together, not as orphans that
    // hold the 'close' event open forever.
    const proc = spawn(pythonBin, ['-c', PY_PROGRAM, absolutePath, language, model], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      log(`whisper: timeout after ${timeoutMs}ms — killing process group`);
      try {
        if (proc.pid !== undefined) {
          // Negative PID => signal the entire process group.
          process.kill(-proc.pid, 'SIGKILL');
        } else {
          proc.kill('SIGKILL');
        }
      } catch { /* best effort */ }
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      log(`whisper: spawn error: ${err.message}`);
      resolve(null);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - started;

      if (timedOut) {
        log(`whisper: aborted (file kept): ${absolutePath}`);
        resolve(null);
        return;
      }
      if (code !== 0) {
        const tail = stderr.slice(-300).trim();
        log(`whisper: exit ${code} after ${elapsed}ms; stderr: ${tail || '(empty)'}`);
        resolve(null);
        return;
      }

      let parsed: { text?: string };
      try {
        parsed = JSON.parse(stdout.trim()) as { text?: string };
      } catch (err) {
        log(`whisper: parse error after ${elapsed}ms: ${(err as Error).message}; stdout head: ${stdout.slice(0, 200)}`);
        resolve(null);
        return;
      }

      const text = (parsed.text ?? '').trim();
      if (!text) {
        log(`whisper: empty transcript after ${elapsed}ms — keeping file`);
        resolve(null);
        return;
      }

      if (cleanupOnSuccess) {
        try {
          unlinkSync(absolutePath);
          log(`whisper: ${elapsed}ms, ${text.length} chars; cleaned up ${absolutePath}`);
        } catch (err) {
          log(`whisper: transcribed but cleanup failed for ${absolutePath}: ${(err as Error).message}`);
        }
      } else {
        log(`whisper: ${elapsed}ms, ${text.length} chars (cleanup disabled)`);
      }

      resolve(text);
    });
  });
}
