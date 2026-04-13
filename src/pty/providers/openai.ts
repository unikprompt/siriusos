import { join } from 'path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { platform } from 'os';
import type { ProviderStrategy, ProviderSpawnOptions } from './types.js';

const MARKER_START = '<!-- cortextos:begin -->';
const MARKER_END = '<!-- cortextos:end -->';

export const openaiStrategy: ProviderStrategy = {
  command() {
    return platform() === 'win32' ? 'codex.cmd' : 'codex';
  },

  buildArgs(opts: ProviderSpawnOptions): string[] {
    const args: string[] = [];

    if (opts.mode === 'continue') {
      args.push('resume', '--last');
    }

    args.push('--sandbox', 'danger-full-access');
    args.push('--ask-for-approval', 'never');

    if (opts.config.model) {
      args.push('--model', opts.config.model);
    }

    args.push(opts.prompt);

    return args;
  },

  async prepareWorkspace(opts: ProviderSpawnOptions): Promise<void> {
    const localDir = join(opts.agentDir, 'local');
    if (!existsSync(localDir)) return;

    let localContent: string;
    try {
      const mdFiles = readdirSync(localDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => join(localDir, f));
      if (mdFiles.length === 0) return;
      localContent = mdFiles
        .map(f => readFileSync(f, 'utf-8'))
        .join('\n\n');
    } catch {
      return;
    }

    const agentsPath = join(opts.agentDir, 'AGENTS.md');
    const block = `${MARKER_START}\n${localContent}\n${MARKER_END}`;

    let next: string;
    if (existsSync(agentsPath)) {
      const current = readFileSync(agentsPath, 'utf-8');
      const startIdx = current.indexOf(MARKER_START);
      const endIdx = current.indexOf(MARKER_END);
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        next = current.slice(0, startIdx) + block + current.slice(endIdx + MARKER_END.length);
      } else {
        next = current.trimEnd() + '\n\n' + block + '\n';
      }
    } else {
      next = block + '\n';
    }

    writeFileSync(agentsPath, next, 'utf-8');
  },
};
