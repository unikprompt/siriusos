import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendDailyMemory, listMemoryFiles } from '../../../src/memory/daily.js';

describe('appendDailyMemory', () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'siriusos-single-memory-test-'));
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  it('creates the memory dir on first call', () => {
    appendDailyMemory(agentDir, 'user', 'hola');
    expect(existsSync(join(agentDir, 'memory'))).toBe(true);
    const files = readdirSync(join(agentDir, 'memory'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('writes entry with HH:MM — type header and content', () => {
    appendDailyMemory(agentDir, 'user', 'pregunta de prueba');
    const files = readdirSync(join(agentDir, 'memory'));
    const content = readFileSync(join(agentDir, 'memory', files[0]), 'utf-8');
    expect(content).toMatch(/^# Memory — \d{4}-\d{2}-\d{2}$/m);
    expect(content).toMatch(/^## \d{2}:\d{2} — user$/m);
    expect(content).toContain('pregunta de prueba');
  });

  it('appends multiple entries to the same day file', () => {
    appendDailyMemory(agentDir, 'user', 'primero');
    appendDailyMemory(agentDir, 'agent', 'segundo');
    appendDailyMemory(agentDir, 'user', 'tercero');
    const files = readdirSync(join(agentDir, 'memory'));
    expect(files).toHaveLength(1);
    const content = readFileSync(join(agentDir, 'memory', files[0]), 'utf-8');
    expect(content).toContain('primero');
    expect(content).toContain('segundo');
    expect(content).toContain('tercero');
    // Order preserved
    expect(content.indexOf('primero')).toBeLessThan(content.indexOf('segundo'));
    expect(content.indexOf('segundo')).toBeLessThan(content.indexOf('tercero'));
  });

  it('trims surrounding whitespace from content', () => {
    appendDailyMemory(agentDir, 'agent', '  \n  hello  \n  ');
    const files = readdirSync(join(agentDir, 'memory'));
    const content = readFileSync(join(agentDir, 'memory', files[0]), 'utf-8');
    expect(content).toMatch(/^hello$/m);
  });
});

describe('listMemoryFiles', () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'siriusos-single-list-test-'));
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  it('returns empty array when memory dir does not exist', () => {
    expect(listMemoryFiles(agentDir)).toEqual([]);
  });

  it('returns sorted YYYY-MM-DD.md files only', () => {
    appendDailyMemory(agentDir, 'user', 'today');
    // Manually create older files so we can test sorting deterministically
    const { writeFileSync, mkdirSync } = require('fs') as typeof import('fs');
    mkdirSync(join(agentDir, 'memory'), { recursive: true });
    writeFileSync(join(agentDir, 'memory', '2025-12-31.md'), '# Memory\n', 'utf-8');
    writeFileSync(join(agentDir, 'memory', '2026-01-15.md'), '# Memory\n', 'utf-8');
    writeFileSync(join(agentDir, 'memory', 'not-a-date.txt'), 'noise', 'utf-8');

    const files = listMemoryFiles(agentDir);
    expect(files).toContain('2025-12-31.md');
    expect(files).toContain('2026-01-15.md');
    expect(files).not.toContain('not-a-date.txt');
    // Sorted oldest-first
    expect(files.indexOf('2025-12-31.md')).toBeLessThan(files.indexOf('2026-01-15.md'));
  });
});
