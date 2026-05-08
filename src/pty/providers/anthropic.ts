import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { platform } from 'os';
import type { ProviderStrategy, ProviderSpawnOptions } from './types.js';

export const anthropicStrategy: ProviderStrategy = {
  command() {
    if (platform() !== 'win32') return 'claude';
    // The Claude Code Windows installer historically shipped a `claude.cmd`
    // shim alongside `claude.exe`. Newer installers (e.g. when claude lives
    // under `~/.local/bin`) ship only `claude.exe` and have no `.cmd` shim.
    // Hardcoding `claude.cmd` causes node-pty/ConPTY to fail with an empty
    // "File not found" error before the agent ever boots.
    //
    // Probe PATH for whichever extension is present and prefer `.exe` —
    // it spawns more cleanly under ConPTY than a `.cmd` wrapper, and matches
    // what `where.exe claude` returns on current installs.
    const pathDirs = (process.env.PATH || '').split(';').filter(Boolean);
    for (const ext of ['.exe', '.cmd']) {
      for (const dir of pathDirs) {
        if (existsSync(join(dir, `claude${ext}`))) {
          return `claude${ext}`;
        }
      }
    }
    // Neither found on PATH — fall back to the legacy default so the error
    // message from node-pty surfaces a recognizable filename for debugging.
    return 'claude.cmd';
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
