import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export type PatternType = 'trigger-phrase' | 'repeated-sequence' | 'repeated-task';

export interface Evidence {
  source: 'inbox' | 'memory' | 'event';
  timestamp: string;
  excerpt: string;
  ref?: string;
}

export interface Suggestion {
  id: string;
  agent: string;
  pattern_type: PatternType;
  pattern_key: string;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  evidence: Evidence[];
  source_summary: string;
}

export interface DetectorOptions {
  agent: string;
  org: string;
  ctxRoot: string;
  frameworkRoot: string;
  windowDays?: number;
  minOccurrences?: number;
  now?: Date;
}

const TRIGGER_PHRASES_ES = [
  'siempre acordate de',
  'siempre acuerdate de',
  'siempre recuerda',
  'siempre recordate',
  'de ahora en adelante',
  'la proxima vez',
  'la próxima vez',
  'siempre que',
  'no olvides',
  'acordate siempre',
  'acuerdate siempre',
  'a partir de ahora',
];

const TRIGGER_PHRASES_EN = [
  'from now on',
  'next time',
  'always remember to',
  'always do',
  'never forget to',
  'make sure to always',
  'going forward',
];

const TRIGGER_PHRASES = [...TRIGGER_PHRASES_ES, ...TRIGGER_PHRASES_EN];

const MAX_EVIDENCE_PER_SUGGESTION = 5;
const EXCERPT_MAX_LEN = 200;

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function excerpt(s: string, around?: number): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= EXCERPT_MAX_LEN) return cleaned;
  if (around === undefined) return cleaned.slice(0, EXCERPT_MAX_LEN) + '…';
  const start = Math.max(0, around - Math.floor(EXCERPT_MAX_LEN / 2));
  const end = Math.min(cleaned.length, start + EXCERPT_MAX_LEN);
  return (start > 0 ? '…' : '') + cleaned.slice(start, end) + (end < cleaned.length ? '…' : '');
}

function isWithinWindow(timestamp: string, windowStart: Date): boolean {
  const t = new Date(timestamp);
  return !isNaN(t.getTime()) && t >= windowStart;
}

function listDailyFiles(dir: string, windowStart: Date, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .filter((f) => {
      const datePart = f.slice(0, 10);
      const fileDate = new Date(datePart + 'T00:00:00Z');
      if (isNaN(fileDate.getTime())) return false;
      const dayMs = 24 * 60 * 60 * 1000;
      return fileDate.getTime() >= windowStart.getTime() - dayMs;
    })
    .map((f) => join(dir, f));
}

interface InboxMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  text: string;
  ref: string;
}

function readProcessedInbox(opts: DetectorOptions, windowStart: Date): InboxMessage[] {
  const dir = join(opts.ctxRoot, 'processed', opts.agent);
  if (!existsSync(dir)) return [];
  const out: InboxMessage[] = [];
  for (const fname of readdirSync(dir)) {
    if (!fname.endsWith('.json')) continue;
    const fullPath = join(dir, fname);
    let parsed: any;
    try {
      parsed = JSON.parse(readFileSync(fullPath, 'utf-8'));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const ts = parsed.timestamp || '';
    if (!ts || !isWithinWindow(ts, windowStart)) continue;
    out.push({
      id: parsed.id || fname,
      from: parsed.from || 'unknown',
      to: parsed.to || opts.agent,
      timestamp: ts,
      text: typeof parsed.text === 'string' ? parsed.text : '',
      ref: fullPath,
    });
  }
  return out;
}

interface EventEntry {
  id: string;
  timestamp: string;
  category: string;
  event: string;
  metadata: Record<string, unknown>;
  ref: string;
}

function readEvents(opts: DetectorOptions, windowStart: Date): EventEntry[] {
  const dir = join(opts.ctxRoot, 'orgs', opts.org, 'analytics', 'events', opts.agent);
  const files = listDailyFiles(dir, windowStart, '.jsonl');
  const out: EventEntry[] = [];
  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = parsed.timestamp || '';
      if (!ts || !isWithinWindow(ts, windowStart)) continue;
      out.push({
        id: parsed.id || '',
        timestamp: ts,
        category: parsed.category || '',
        event: parsed.event || '',
        metadata: parsed.metadata || {},
        ref: file,
      });
    }
  }
  return out;
}

interface MemoryEntry {
  date: string;
  text: string;
  ref: string;
}

function readMemory(opts: DetectorOptions, windowStart: Date): MemoryEntry[] {
  const dir = join(opts.frameworkRoot, 'orgs', opts.org, 'agents', opts.agent, 'memory');
  const files = listDailyFiles(dir, windowStart, '.md');
  const out: MemoryEntry[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const datePart = file.split('/').pop()!.slice(0, 10);
      out.push({ date: datePart, text: content, ref: file });
    } catch {
      // ignore
    }
  }
  return out;
}

interface TaskRecord {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  status: string;
  created_at: string;
  ref: string;
}

function readTasks(opts: DetectorOptions, windowStart: Date): TaskRecord[] {
  const dir = join(opts.ctxRoot, 'orgs', opts.org, 'tasks');
  if (!existsSync(dir)) return [];
  const out: TaskRecord[] = [];
  for (const fname of readdirSync(dir)) {
    if (!fname.endsWith('.json')) continue;
    const fullPath = join(dir, fname);
    let parsed: any;
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      parsed = JSON.parse(readFileSync(fullPath, 'utf-8'));
    } catch {
      continue;
    }
    if (!parsed || parsed.assigned_to !== opts.agent) continue;
    const ts = parsed.created_at || '';
    if (!ts || !isWithinWindow(ts, windowStart)) continue;
    out.push({
      id: parsed.id,
      title: parsed.title || '',
      description: parsed.description || '',
      assigned_to: parsed.assigned_to,
      status: parsed.status || '',
      created_at: ts,
      ref: fullPath,
    });
  }
  return out;
}

function detectTriggerPhrases(
  agent: string,
  inbox: InboxMessage[],
  memory: MemoryEntry[],
): Suggestion[] {
  const out: Suggestion[] = [];
  const sources: Array<{ source: 'inbox' | 'memory'; timestamp: string; text: string; ref: string }> = [
    ...inbox.map((m) => ({ source: 'inbox' as const, timestamp: m.timestamp, text: m.text, ref: m.ref })),
    ...memory.map((m) => ({
      source: 'memory' as const,
      timestamp: m.date + 'T12:00:00Z',
      text: m.text,
      ref: m.ref,
    })),
  ];

  // Group hits by canonical (normalized) phrase so accent variants collapse.
  const groups = new Map<string, { canonical: string; evidence: Evidence[]; firstTs: string; lastTs: string }>();
  for (const src of sources) {
    const lower = normalizeText(src.text);
    for (const phrase of TRIGGER_PHRASES) {
      const canonical = normalizeText(phrase);
      let idx = 0;
      while ((idx = lower.indexOf(canonical, idx)) !== -1) {
        const ev: Evidence = {
          source: src.source,
          timestamp: src.timestamp,
          excerpt: excerpt(src.text, idx),
          ref: src.ref,
        };
        let g = groups.get(canonical);
        if (!g) {
          g = { canonical, evidence: [], firstTs: src.timestamp, lastTs: src.timestamp };
          groups.set(canonical, g);
        }
        g.evidence.push(ev);
        if (src.timestamp < g.firstTs) g.firstTs = src.timestamp;
        if (src.timestamp > g.lastTs) g.lastTs = src.timestamp;
        idx += canonical.length;
      }
    }
  }
  for (const g of groups.values()) {
    out.push({
      id: sha256(`trigger:${agent}:${g.canonical}`),
      agent,
      pattern_type: 'trigger-phrase',
      pattern_key: g.canonical,
      occurrences: g.evidence.length,
      first_seen: g.firstTs,
      last_seen: g.lastTs,
      evidence: g.evidence.slice(0, MAX_EVIDENCE_PER_SUGGESTION),
      source_summary: `Frase trigger "${g.canonical}" detectada ${g.evidence.length} vez/veces`,
    });
  }
  return out;
}

function detectRepeatedSequences(
  agent: string,
  events: EventEntry[],
  minOccurrences: number,
): Suggestion[] {
  const sorted = events
    .filter((e) => e.category !== 'heartbeat' && e.event !== 'heartbeat' && e.event !== 'agent_heartbeat')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const sequences = new Map<string, EventEntry[]>();
  const windowSize = 3;
  for (let i = 0; i + windowSize <= sorted.length; i++) {
    const slice = sorted.slice(i, i + windowSize);
    const first = new Date(slice[0].timestamp).getTime();
    const last = new Date(slice[windowSize - 1].timestamp).getTime();
    if (last - first > 30 * 60 * 1000) continue;
    const key = slice.map((e) => `${e.category}:${e.event}`).join('|');
    if (!sequences.has(key)) sequences.set(key, []);
    sequences.get(key)!.push(slice[0]);
  }

  const out: Suggestion[] = [];
  for (const [key, occs] of sequences) {
    if (occs.length < minOccurrences) continue;
    // Skip sequences that are 100% bus messaging (inbox_ack, agent_message_sent, telegram_sent).
    // These reflect inherent agent plumbing, not workflow patterns worth turning into a skill.
    const steps = key.split('|');
    const allMessaging = steps.every((s) => s.startsWith('message:'));
    if (allMessaging) continue;
    const first = occs[0];
    const last = occs[occs.length - 1];
    out.push({
      id: sha256(`seq:${agent}:${key}`),
      agent,
      pattern_type: 'repeated-sequence',
      pattern_key: key,
      occurrences: occs.length,
      first_seen: first.timestamp,
      last_seen: last.timestamp,
      evidence: occs.slice(0, MAX_EVIDENCE_PER_SUGGESTION).map((e) => ({
        source: 'event' as const,
        timestamp: e.timestamp,
        excerpt: `${e.category}/${e.event}`,
        ref: e.ref,
      })),
      source_summary: `Secuencia "${key}" repetida ${occs.length} veces (ventana 30min)`,
    });
  }
  return out;
}

function tokenizeTitle(title: string): string[] {
  return normalizeText(title)
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

function detectRepeatedTasks(
  agent: string,
  tasks: TaskRecord[],
  minOccurrences: number,
): Suggestion[] {
  const tokenized = tasks.map((t) => ({ task: t, tokens: new Set(tokenizeTitle(t.title)) }));
  const visited = new Set<number>();
  const clusters: Array<{ tasks: TaskRecord[]; tokens: Set<string> }> = [];
  for (let i = 0; i < tokenized.length; i++) {
    if (visited.has(i)) continue;
    const cluster = { tasks: [tokenized[i].task], tokens: new Set(tokenized[i].tokens) };
    visited.add(i);
    for (let j = i + 1; j < tokenized.length; j++) {
      if (visited.has(j)) continue;
      if (jaccard(tokenized[i].tokens, tokenized[j].tokens) >= 0.5) {
        cluster.tasks.push(tokenized[j].task);
        for (const t of tokenized[j].tokens) cluster.tokens.add(t);
        visited.add(j);
      }
    }
    if (cluster.tasks.length >= minOccurrences) clusters.push(cluster);
  }

  const out: Suggestion[] = [];
  for (const cluster of clusters) {
    cluster.tasks.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = cluster.tasks[0];
    const last = cluster.tasks[cluster.tasks.length - 1];
    const sharedTokens = [...cluster.tokens].sort().slice(0, 6).join(' ');
    out.push({
      id: sha256(`task:${agent}:${sharedTokens}`),
      agent,
      pattern_type: 'repeated-task',
      pattern_key: sharedTokens,
      occurrences: cluster.tasks.length,
      first_seen: first.created_at,
      last_seen: last.created_at,
      evidence: cluster.tasks.slice(0, MAX_EVIDENCE_PER_SUGGESTION).map((t) => ({
        source: 'event' as const,
        timestamp: t.created_at,
        excerpt: excerpt(t.title),
        ref: t.ref,
      })),
      source_summary: `${cluster.tasks.length} tareas con tokens compartidos: ${sharedTokens}`,
    });
  }
  return out;
}

export function detect(opts: DetectorOptions): Suggestion[] {
  const windowDays = opts.windowDays ?? 7;
  const minOccurrences = opts.minOccurrences ?? 3;
  const now = opts.now ?? new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const inbox = readProcessedInbox(opts, windowStart);
  const events = readEvents(opts, windowStart);
  const memory = readMemory(opts, windowStart);
  const tasks = readTasks(opts, windowStart);

  return [
    ...detectTriggerPhrases(opts.agent, inbox, memory),
    ...detectRepeatedSequences(opts.agent, events, minOccurrences),
    ...detectRepeatedTasks(opts.agent, tasks, minOccurrences),
  ];
}

export const _internals = {
  TRIGGER_PHRASES,
  normalizeText,
  excerpt,
  jaccard,
  tokenizeTitle,
};
