/**
 * Daily memory writer for SiriusOS Single.
 *
 * Writes a Markdown transcript of each day's conversation to
 * `<agentDir>/memory/YYYY-MM-DD.md`. The agent reads these files on
 * boot to recover context across restarts.
 *
 * Append semantics: read existing file (if any), concatenate new entry,
 * atomic rewrite. Cheap for a single-agent system that processes at most
 * a few hundred messages per day.
 */
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { atomicWriteSync } from '../utils/atomic.js';

export type MemoryEntryType = 'user' | 'agent' | 'system';

/**
 * Append a single entry to today's memory file.
 *
 * Format:
 * ```
 * ## HH:MM — <type>
 * <content>
 * ```
 *
 * Multiple consecutive entries are separated by blank lines so the file
 * stays readable when an agent reads it via tool call.
 */
export function appendDailyMemory(
  agentDir: string,
  type: MemoryEntryType,
  content: string,
): void {
  const memoryDir = join(agentDir, 'memory');
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 5);  // HH:MM
  const filePath = join(memoryDir, `${date}.md`);

  const entry = `## ${time} — ${type}\n${content.trim()}\n`;

  let existing = '';
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf-8');
    if (!existing.endsWith('\n\n')) {
      existing = existing.replace(/\n*$/, '\n\n');
    }
  } else {
    existing = `# Memory — ${date}\n\n`;
  }

  atomicWriteSync(filePath, existing + entry);
}

/**
 * List the YYYY-MM-DD.md memory files present for this agent, sorted
 * oldest-first. Used by `export` to populate the manifest.
 */
export function listMemoryFiles(agentDir: string): string[] {
  const memoryDir = join(agentDir, 'memory');
  if (!existsSync(memoryDir)) return [];
  const { readdirSync } = require('fs') as typeof import('fs');
  return readdirSync(memoryDir)
    .filter((f: string) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
}
