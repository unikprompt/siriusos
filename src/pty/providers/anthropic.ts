import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { platform } from 'os';
import type { ProviderStrategy, ProviderSpawnOptions } from './types.js';

export const anthropicStrategy: ProviderStrategy = {
  command() {
    return platform() === 'win32' ? 'claude.cmd' : 'claude';
  },

  buildArgs(opts: ProviderSpawnOptions): string[] {
    const args: string[] = [];

    if (opts.mode === 'continue') {
      args.push('--continue');
    }

    args.push('--dangerously-skip-permissions');

    if (opts.config.model) {
      args.push('--model', opts.config.model);
    }

    const localDir = join(opts.agentDir, 'local');
    if (existsSync(localDir)) {
      try {
        const mdFiles = readdirSync(localDir)
          .filter(f => f.endsWith('.md'))
          .sort()
          .map(f => join(localDir, f));
        if (mdFiles.length > 0) {
          const localContent = mdFiles
            .map(f => readFileSync(f, 'utf-8'))
            .join('\n\n');
          args.push('--append-system-prompt', localContent);
        }
      } catch { /* ignore read errors */ }
    }

    args.push(opts.prompt);

    return args;
  },
};
