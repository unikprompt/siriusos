/**
 * Locale detection for the CLI. Order of precedence:
 *   1. Explicit --lang flag (handled by the caller, then passed in)
 *   2. Persisted org context (if loaded by the caller)
 *   3. LANG / LC_ALL / LC_MESSAGES env vars (es* → 'es', otherwise 'en')
 *   4. Default 'en'
 */
import type { Locale } from '../../types/index.js';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

/**
 * Best-effort locale guess from POSIX locale env vars. Returns null
 * when no env var is set or the value is not recognised, so the
 * caller can decide whether to fall back to a default or prompt.
 */
export function detectLocale(): Locale | null {
  const env = process.env;
  const candidates = [env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const raw of candidates) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (lower.startsWith('es')) return 'es';
    if (lower.startsWith('en')) return 'en';
  }
  return null;
}
