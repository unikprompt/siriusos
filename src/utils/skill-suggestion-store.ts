import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { atomicWriteSync } from './atomic.js';
import type { Suggestion } from './skill-suggestion-detector.js';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'notified';

export interface StoredSuggestion extends Suggestion {
  status: SuggestionStatus;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  rejected_at?: string;
  rejected_reason?: string;
  notified_at?: string;
  draft_path?: string;
}

export interface SuggestionStore {
  version: 1;
  agent: string;
  suggestions: Record<string, StoredSuggestion>;
}

export const REJECTION_COOLDOWN_DAYS = 30;

export function storePath(ctxRoot: string, agent: string): string {
  return join(ctxRoot, 'state', agent, 'skill-suggestions.json');
}

export function loadStore(ctxRoot: string, agent: string): SuggestionStore {
  const p = storePath(ctxRoot, agent);
  if (!existsSync(p)) {
    return { version: 1, agent, suggestions: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    if (parsed && parsed.version === 1 && typeof parsed.suggestions === 'object') {
      return parsed as SuggestionStore;
    }
  } catch {
    // fall through to fresh
  }
  return { version: 1, agent, suggestions: {} };
}

export function saveStore(ctxRoot: string, store: SuggestionStore): void {
  const p = storePath(ctxRoot, store.agent);
  mkdirSync(join(ctxRoot, 'state', store.agent), { recursive: true });
  atomicWriteSync(p, JSON.stringify(store, null, 2));
}

export interface MergeResult {
  added: number;
  updated: number;
  suppressed: number;
}

export function mergeSuggestions(
  store: SuggestionStore,
  fresh: Suggestion[],
  now: Date = new Date(),
): MergeResult {
  const result: MergeResult = { added: 0, updated: 0, suppressed: 0 };
  const cooldownMs = REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  for (const s of fresh) {
    const existing = store.suggestions[s.id];

    if (existing && existing.status === 'rejected' && existing.rejected_at) {
      const rejectedAt = new Date(existing.rejected_at).getTime();
      if (now.getTime() - rejectedAt < cooldownMs) {
        result.suppressed += 1;
        continue;
      }
      store.suggestions[s.id] = {
        ...s,
        status: 'pending',
        created_at: existing.created_at,
        updated_at: now.toISOString(),
      };
      result.updated += 1;
      continue;
    }

    if (existing) {
      const wasApprovedOrNotified =
        existing.status === 'approved' || existing.status === 'notified';
      store.suggestions[s.id] = {
        ...existing,
        occurrences: Math.max(existing.occurrences, s.occurrences),
        last_seen: s.last_seen > existing.last_seen ? s.last_seen : existing.last_seen,
        first_seen: s.first_seen < existing.first_seen ? s.first_seen : existing.first_seen,
        evidence: s.evidence,
        source_summary: s.source_summary,
        updated_at: now.toISOString(),
        status: wasApprovedOrNotified ? existing.status : 'pending',
      };
      result.updated += 1;
      continue;
    }

    store.suggestions[s.id] = {
      ...s,
      status: 'pending',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    result.added += 1;
  }
  return result;
}

export interface ListFilter {
  status?: SuggestionStatus | 'all';
  since?: Date;
  patternType?: string;
}

export function listSuggestions(store: SuggestionStore, filter: ListFilter = {}): StoredSuggestion[] {
  let arr = Object.values(store.suggestions);
  if (filter.status && filter.status !== 'all') {
    arr = arr.filter((s) => s.status === filter.status);
  }
  if (filter.since) {
    const sinceMs = filter.since.getTime();
    arr = arr.filter((s) => new Date(s.updated_at).getTime() >= sinceMs);
  }
  if (filter.patternType) {
    arr = arr.filter((s) => s.pattern_type === filter.patternType);
  }
  arr.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return arr;
}

export function defaultCtxRoot(instance: string): string {
  return join(homedir(), '.cortextos', instance);
}
