import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  loadStore,
  saveStore,
  mergeSuggestions,
  listSuggestions,
  storePath,
  REJECTION_COOLDOWN_DAYS,
} from '../../../src/utils/skill-suggestion-store';
import type { Suggestion } from '../../../src/utils/skill-suggestion-detector';

let ctxRoot: string;

beforeEach(() => {
  ctxRoot = join(tmpdir(), `sss-${randomBytes(6).toString('hex')}`);
  mkdirSync(ctxRoot, { recursive: true });
});

afterEach(() => {
  rmSync(ctxRoot, { recursive: true, force: true });
});

function fakeSuggestion(id: string, overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id,
    agent: 'developer',
    pattern_type: 'trigger-phrase',
    pattern_key: 'from now on',
    occurrences: 1,
    first_seen: '2026-04-29T10:00:00Z',
    last_seen: '2026-04-29T10:00:00Z',
    evidence: [{ source: 'inbox', timestamp: '2026-04-29T10:00:00Z', excerpt: 'from now on do X' }],
    source_summary: 'test',
    ...overrides,
  };
}

describe('skill-suggestion-store', () => {
  it('returns empty store when file does not exist', () => {
    const store = loadStore(ctxRoot, 'developer');
    expect(store.version).toBe(1);
    expect(store.suggestions).toEqual({});
  });

  it('saves and reloads round-trip', () => {
    const store = loadStore(ctxRoot, 'developer');
    mergeSuggestions(store, [fakeSuggestion('a1')]);
    saveStore(ctxRoot, store);
    expect(existsSync(storePath(ctxRoot, 'developer'))).toBe(true);
    const reloaded = loadStore(ctxRoot, 'developer');
    expect(reloaded.suggestions['a1']?.pattern_key).toBe('from now on');
    expect(reloaded.suggestions['a1']?.status).toBe('pending');
  });

  it('merge adds new and updates existing', () => {
    const store = loadStore(ctxRoot, 'developer');
    let r = mergeSuggestions(store, [fakeSuggestion('a1')]);
    expect(r.added).toBe(1);
    r = mergeSuggestions(store, [fakeSuggestion('a1', { occurrences: 5 })]);
    expect(r.updated).toBe(1);
    expect(store.suggestions['a1'].occurrences).toBe(5);
  });

  it('preserves approved/notified status on re-detection', () => {
    const store = loadStore(ctxRoot, 'developer');
    mergeSuggestions(store, [fakeSuggestion('a1')]);
    store.suggestions['a1'].status = 'approved';
    store.suggestions['a1'].approved_at = '2026-04-30T00:00:00Z';
    mergeSuggestions(store, [fakeSuggestion('a1', { occurrences: 9 })]);
    expect(store.suggestions['a1'].status).toBe('approved');
    expect(store.suggestions['a1'].occurrences).toBe(9);
  });

  it('suppresses redetection of rejected within cooldown window', () => {
    const store = loadStore(ctxRoot, 'developer');
    mergeSuggestions(store, [fakeSuggestion('a1')]);
    const now = new Date('2026-05-01T00:00:00Z');
    store.suggestions['a1'].status = 'rejected';
    store.suggestions['a1'].rejected_at = '2026-04-25T00:00:00Z';
    const r = mergeSuggestions(store, [fakeSuggestion('a1')], now);
    expect(r.suppressed).toBe(1);
    expect(store.suggestions['a1'].status).toBe('rejected');
  });

  it('re-promotes rejected to pending after cooldown', () => {
    const store = loadStore(ctxRoot, 'developer');
    mergeSuggestions(store, [fakeSuggestion('a1')]);
    const now = new Date('2026-05-01T00:00:00Z');
    store.suggestions['a1'].status = 'rejected';
    store.suggestions['a1'].rejected_at = new Date(
      now.getTime() - (REJECTION_COOLDOWN_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const r = mergeSuggestions(store, [fakeSuggestion('a1')], now);
    expect(r.updated).toBe(1);
    expect(store.suggestions['a1'].status).toBe('pending');
  });

  it('list filters by status and sorts by updated_at desc', () => {
    const store = loadStore(ctxRoot, 'developer');
    mergeSuggestions(store, [
      fakeSuggestion('a1'),
      fakeSuggestion('a2', { id: 'a2' }),
    ]);
    store.suggestions['a1'].updated_at = '2026-05-01T00:00:00Z';
    store.suggestions['a2'].updated_at = '2026-05-02T00:00:00Z';
    store.suggestions['a2'].status = 'rejected';
    const pending = listSuggestions(store, { status: 'pending' });
    expect(pending.map((s) => s.id)).toEqual(['a1']);
    const all = listSuggestions(store, { status: 'all' });
    expect(all.map((s) => s.id)).toEqual(['a2', 'a1']);
  });

  it('list filters by since timestamp', () => {
    const store = loadStore(ctxRoot, 'developer');
    mergeSuggestions(store, [fakeSuggestion('a1'), fakeSuggestion('a2', { id: 'a2' })]);
    store.suggestions['a1'].updated_at = '2026-04-25T00:00:00Z';
    store.suggestions['a2'].updated_at = '2026-04-30T00:00:00Z';
    const recent = listSuggestions(store, { since: new Date('2026-04-29T00:00:00Z') });
    expect(recent.map((s) => s.id)).toEqual(['a2']);
  });

  it('handles malformed store file gracefully', () => {
    const p = storePath(ctxRoot, 'developer');
    mkdirSync(join(ctxRoot, 'state', 'developer'), { recursive: true });
    require('fs').writeFileSync(p, '{not-json');
    const store = loadStore(ctxRoot, 'developer');
    expect(store.suggestions).toEqual({});
  });

  it('saved store JSON is human-readable', () => {
    const store = loadStore(ctxRoot, 'developer');
    mergeSuggestions(store, [fakeSuggestion('a1')]);
    saveStore(ctxRoot, store);
    const raw = readFileSync(storePath(ctxRoot, 'developer'), 'utf-8');
    expect(raw).toContain('\n  ');
    expect(raw).toContain('"version": 1');
  });
});
