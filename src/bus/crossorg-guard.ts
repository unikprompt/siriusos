import { readFileSync } from 'fs';
import { join } from 'path';
import type { CrossOrgMode } from '../types/index.js';

export interface CrossOrgGuardConfig {
  mode: CrossOrgMode;
  whitelist: string[];
}

/**
 * Resolve the cross-org quarantine guard config for an org from its
 * `context.json` `guard` block:
 *
 *   { "guard": { "crossorg_mode": "quarantine", "crossorg_whitelist": ["sirius-lex"] } }
 *
 * Default is 'mark' (today's behavior): the guard only quarantines when an org
 * explicitly opts in with `crossorg_mode: "quarantine"`. A missing or unreadable
 * context.json, or a missing/invalid guard block, falls back to 'mark' — the
 * guard can never fail closed by accident. Shared by the CLI (check-inbox) and
 * the daemon's fast-checker so both reception paths decide identically.
 */
export function resolveCrossOrgGuard(frameworkRoot: string, org: string): CrossOrgGuardConfig {
  const fallback: CrossOrgGuardConfig = { mode: 'mark', whitelist: [] };
  if (!frameworkRoot || !org) return fallback;
  try {
    const ctx = JSON.parse(readFileSync(join(frameworkRoot, 'orgs', org, 'context.json'), 'utf-8'));
    const g = (ctx && ctx.guard) || {};
    const mode: CrossOrgMode = g.crossorg_mode === 'quarantine' ? 'quarantine' : 'mark';
    const whitelist: string[] = Array.isArray(g.crossorg_whitelist)
      ? g.crossorg_whitelist.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    return { mode, whitelist };
  } catch {
    return fallback;
  }
}
