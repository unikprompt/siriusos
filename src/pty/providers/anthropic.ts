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

    // Claude Code reasoning effort (`--effort`). Only the five levels Claude
    // Code accepts are forwarded; an out-of-range value from a hand-edited
    // config.json is skipped so the agent still boots at Claude Code's own
    // default rather than dying on an unknown flag value. Codex runtimes carry
    // their effort separately via `reasoning_effort`.
    const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
    const claudeEffort = opts.config.claude_effort;
    if (claudeEffort && (CLAUDE_EFFORTS as readonly string[]).includes(claudeEffort)) {
      args.push('--effort', claudeEffort);
    } else if (claudeEffort) {
      // A typo'd value in a hand-edited config.json ("medum") would otherwise
      // boot silently at Claude Code's own default while the operator believes
      // the agent is running at the level they set — a silent fallback that only
      // surfaces in the bill or the behavior. Still boot (skip the bad flag), but
      // leave a unique, greppable trace so the typo is findable.
      console.error(`[anthropic] ignoring invalid claude_effort '${claudeEffort}' (expected one of ${CLAUDE_EFFORTS.join('|')})`);
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
