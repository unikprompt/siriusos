import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { detect, _internals } from '../../../src/utils/skill-suggestion-detector';

let ctxRoot: string;
let frameworkRoot: string;

beforeEach(() => {
  const id = randomBytes(6).toString('hex');
  ctxRoot = join(tmpdir(), `ssd-ctx-${id}`);
  frameworkRoot = join(tmpdir(), `ssd-fw-${id}`);
  mkdirSync(ctxRoot, { recursive: true });
  mkdirSync(frameworkRoot, { recursive: true });
});

afterEach(() => {
  rmSync(ctxRoot, { recursive: true, force: true });
  rmSync(frameworkRoot, { recursive: true, force: true });
});

function writeProcessed(agent: string, fname: string, payload: object) {
  const dir = join(ctxRoot, 'processed', agent);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fname), JSON.stringify(payload), 'utf-8');
}

function writeEvents(org: string, agent: string, dateStr: string, lines: object[]) {
  const dir = join(ctxRoot, 'orgs', org, 'analytics', 'events', agent);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${dateStr}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'), 'utf-8');
}

function writeMemory(org: string, agent: string, dateStr: string, content: string) {
  const dir = join(frameworkRoot, 'orgs', org, 'agents', agent, 'memory');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${dateStr}.md`), content, 'utf-8');
}

function writeTask(org: string, taskId: string, payload: object) {
  const dir = join(ctxRoot, 'orgs', org, 'tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${taskId}.json`), JSON.stringify(payload), 'utf-8');
}

const NOW = new Date('2026-05-01T12:00:00Z');

describe('skill-suggestion-detector', () => {
  it('detects ES trigger phrases in inbox', () => {
    writeProcessed('developer', '0-1.json', {
      id: 'm1',
      from: 'orquestador',
      to: 'developer',
      timestamp: '2026-04-29T10:00:00Z',
      text: 'Escucha, de ahora en adelante siempre responde por Telegram primero',
    });
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    const triggers = out.filter((s) => s.pattern_type === 'trigger-phrase');
    expect(triggers.length).toBeGreaterThanOrEqual(1);
    expect(triggers.map((t) => t.pattern_key)).toContain('de ahora en adelante');
  });

  it('detects EN trigger phrases case-insensitive', () => {
    writeProcessed('developer', '0-2.json', {
      id: 'm2',
      from: 'mario',
      to: 'developer',
      timestamp: '2026-04-30T08:00:00Z',
      text: 'From now on, always commit before pushing',
    });
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    const keys = out.filter((s) => s.pattern_type === 'trigger-phrase').map((s) => s.pattern_key);
    expect(keys).toContain('from now on');
  });

  it('detects trigger phrases in daily memory', () => {
    writeMemory('unikprompt', 'developer', '2026-04-30', '# memory\n- siempre acordate de loggear KPIs');
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    const triggers = out.filter((s) => s.pattern_type === 'trigger-phrase');
    expect(triggers.find((t) => t.pattern_key === 'siempre acordate de')).toBeDefined();
  });

  it('ignores accents (normalizes)', () => {
    expect(_internals.normalizeText('próxima')).toBe('proxima');
    writeProcessed('developer', '0-3.json', {
      id: 'm3',
      from: 'mario',
      to: 'developer',
      timestamp: '2026-04-30T08:00:00Z',
      text: 'la PROXIMA vez verifica el build',
    });
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    const keys = out.filter((s) => s.pattern_type === 'trigger-phrase').map((s) => s.pattern_key);
    expect(keys.some((k) => k.includes('proxima'))).toBe(true);
  });

  it('respects time window — old data ignored', () => {
    writeProcessed('developer', '0-4.json', {
      id: 'm4',
      from: 'mario',
      to: 'developer',
      timestamp: '2025-12-01T00:00:00Z',
      text: 'from now on do X',
    });
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    expect(out.filter((s) => s.pattern_type === 'trigger-phrase')).toHaveLength(0);
  });

  it('detects repeated task clusters when N >= minOccurrences', () => {
    for (let i = 0; i < 4; i++) {
      writeTask('unikprompt', `task_${i}`, {
        id: `task_${i}`,
        title: `Re-render reel UnikPrompt iteración ${i}`,
        description: 'render',
        assigned_to: 'developer',
        status: 'completed',
        created_at: `2026-04-29T${10 + i}:00:00Z`,
      });
    }
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    const repeated = out.filter((s) => s.pattern_type === 'repeated-task');
    expect(repeated.length).toBeGreaterThanOrEqual(1);
    expect(repeated[0].occurrences).toBeGreaterThanOrEqual(3);
  });

  it('does NOT flag tasks below minOccurrences', () => {
    for (let i = 0; i < 2; i++) {
      writeTask('unikprompt', `task_${i}`, {
        id: `task_${i}`,
        title: `Compilar dashboard build ${i}`,
        description: 'x',
        assigned_to: 'developer',
        status: 'completed',
        created_at: `2026-04-30T${10 + i}:00:00Z`,
      });
    }
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    expect(out.filter((s) => s.pattern_type === 'repeated-task')).toHaveLength(0);
  });

  it('detects repeated event sequences', () => {
    const seq = [
      { category: 'message', event: 'agent_message_sent' },
      { category: 'message', event: 'inbox_ack' },
      { category: 'task', event: 'task_completed' },
    ];
    const lines: object[] = [];
    for (let i = 0; i < 4; i++) {
      const baseTs = new Date(`2026-04-29T0${i}:00:00Z`).getTime();
      seq.forEach((s, j) => {
        lines.push({
          id: `e${i}-${j}`,
          agent: 'developer',
          org: 'unikprompt',
          timestamp: new Date(baseTs + j * 60_000).toISOString(),
          category: s.category,
          event: s.event,
          severity: 'info',
          metadata: {},
        });
      });
    }
    writeEvents('unikprompt', 'developer', '2026-04-29', lines);
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    const seqs = out.filter((s) => s.pattern_type === 'repeated-sequence');
    expect(seqs.length).toBeGreaterThanOrEqual(1);
    expect(seqs[0].occurrences).toBeGreaterThanOrEqual(3);
  });

  it('ignores heartbeat events in sequence detection', () => {
    const lines: object[] = [];
    for (let i = 0; i < 5; i++) {
      lines.push({
        id: `hb${i}`,
        agent: 'developer',
        org: 'unikprompt',
        timestamp: new Date(Date.parse('2026-04-30T10:00:00Z') + i * 60_000).toISOString(),
        category: 'heartbeat',
        event: 'heartbeat',
        severity: 'info',
        metadata: {},
      });
    }
    writeEvents('unikprompt', 'developer', '2026-04-30', lines);
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    expect(out.filter((s) => s.pattern_type === 'repeated-sequence')).toHaveLength(0);
  });

  it('ignores tasks assigned to another agent', () => {
    for (let i = 0; i < 4; i++) {
      writeTask('unikprompt', `t${i}`, {
        id: `t${i}`,
        title: `Compilar dashboard ${i}`,
        description: 'x',
        assigned_to: 'orquestador',
        status: 'completed',
        created_at: `2026-04-30T${10 + i}:00:00Z`,
      });
    }
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    expect(out.filter((s) => s.pattern_type === 'repeated-task')).toHaveLength(0);
  });

  it('returns empty when nothing exists', () => {
    const out = detect({ agent: 'developer', org: 'unikprompt', ctxRoot, frameworkRoot, now: NOW });
    expect(out).toEqual([]);
  });

  it('jaccard helper computes correctly', () => {
    expect(_internals.jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(_internals.jaccard(new Set(['a']), new Set(['b']))).toBe(0);
    expect(_internals.jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3, 5);
  });
});
