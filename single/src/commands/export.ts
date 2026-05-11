import { Command } from 'commander';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { cpSync, mkdirSync, writeFileSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { listMemoryFiles } from '../memory/daily.js';
import type { AgentConfig } from '../types.js';

const SINGLE_HOME = join(homedir(), '.siriusos-single');

/**
 * Contract reference: `git show 464963a:src/cli/import-agent.ts` (upstream
 * cortextos commit; applied to SiriusOS full as part of the upgrade-path
 * loop). The receiver expects:
 *
 *   <tarball>/
 *     agent/
 *       .export-manifest.json        ← metadata
 *       config.json                  ← agent config (no .env, no secrets)
 *       memory/*.md                  ← daily memory files
 *       local/*                      ← user custom CLAUDE.md etc. (optional)
 *     state/
 *       <agent_name>/                ← heartbeat, polling offset (optional)
 *
 * Manifest shape (all fields except version/agent_name/exported_at optional):
 *   {
 *     version: string                ← we emit "1.0"
 *     agent_name: string
 *     exported_at: ISO timestamp
 *     model?: string
 *     crons?: unknown[]              ← single has no crons in v1, emit []
 *     memory_files?: string[]        ← list of YYYY-MM-DD.md filenames
 *     task_count?: number            ← single has no task system, emit 0
 *   }
 *
 * Files explicitly EXCLUDED from the tarball:
 *   - .env (contains BOT_TOKEN — never export secrets)
 *   - state/downloads/ (raw Telegram media, large + sensitive)
 *   - state/stdout.log (PTY log, large + may contain secrets)
 */

export const exportCommand = new Command('export')
  .description('Export this agent as a tarball for upgrade to SiriusOS full')
  .argument('[agent_name]', 'Agent name (defaults to the only configured agent)')
  .option('-o, --out <path>', 'Output directory for the tarball (default: cwd)')
  .action(async (agentNameArg: string | undefined, opts: { out?: string }) => {
    const agentName = resolveAgentName(agentNameArg);
    const agentDir = join(SINGLE_HOME, agentName);

    if (!existsSync(agentDir)) {
      console.error(chalk.red(`\nAgent "${agentName}" not found. Nothing to export.\n`));
      process.exit(1);
    }

    const outDir = opts.out ? opts.out : process.cwd();
    const tarballPath = join(outDir, `${agentName}-export.tar.gz`);

    const spinner = ora('Building export tarball...').start();

    // Stage in a temp dir so we never include .env or scratch files
    const stagingRoot = mkdtempSync(join(tmpdir(), 'siriusos-export-'));

    try {
      // 1. agent/
      const stagingAgent = join(stagingRoot, 'agent');
      mkdirSync(stagingAgent, { recursive: true });

      // 1a. config.json (copy from source, rewrite to a sensible shape)
      const config = readConfig(agentDir);
      writeFileSync(
        join(stagingAgent, 'config.json'),
        JSON.stringify(config, null, 2),
      );

      // 1b. memory/*.md
      const memoryFiles = listMemoryFiles(agentDir);
      if (memoryFiles.length > 0) {
        const stagingMemory = join(stagingAgent, 'memory');
        mkdirSync(stagingMemory, { recursive: true });
        for (const f of memoryFiles) {
          cpSync(join(agentDir, 'memory', f), join(stagingMemory, f));
        }
      }

      // 1c. local/* (user custom files like CLAUDE.md overrides) — optional
      const localSrc = join(agentDir, 'local');
      if (existsSync(localSrc)) {
        cpSync(localSrc, join(stagingAgent, 'local'), { recursive: true });
      }

      // 1d. .export-manifest.json
      const manifest = {
        version: '1.0',
        agent_name: agentName,
        exported_at: new Date().toISOString(),
        model: config.model,
        crons: [],
        memory_files: memoryFiles,
        task_count: 0,
      };
      writeFileSync(
        join(stagingAgent, '.export-manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      // 2. state/<agent_name>/ (heartbeat + polling offset, no downloads/logs)
      const stateSrc = join(agentDir, 'state');
      if (existsSync(stateSrc)) {
        const stagingState = join(stagingRoot, 'state', agentName);
        mkdirSync(stagingState, { recursive: true });
        const { readdirSync } = require('fs') as typeof import('fs');
        for (const entry of readdirSync(stateSrc, { withFileTypes: true })) {
          // Skip large/sensitive files
          if (entry.name === 'downloads' || entry.name === 'stdout.log' || entry.name === 'stdout.log.1') {
            continue;
          }
          const srcPath = join(stateSrc, entry.name);
          const dstPath = join(stagingState, entry.name);
          if (entry.isDirectory()) {
            cpSync(srcPath, dstPath, { recursive: true });
          } else {
            cpSync(srcPath, dstPath);
          }
        }
      }

      // 3. Create the tarball
      const tarResult = spawnSync(
        'tar',
        ['-czf', tarballPath, '-C', stagingRoot, '.'],
        { encoding: 'utf-8' },
      );
      if (tarResult.status !== 0) {
        spinner.fail('tar command failed');
        console.error(tarResult.stderr || tarResult.stdout);
        process.exit(1);
      }

      const sizeBytes = statSync(tarballPath).size;
      spinner.succeed(`Exported to ${tarballPath} (${formatBytes(sizeBytes)})`);

      console.log();
      console.log(chalk.bold('Contents:'));
      console.log(`  • Agent name: ${agentName}`);
      console.log(`  • Model: ${config.model || '(default)'}`);
      console.log(`  • Memory files: ${memoryFiles.length}`);
      console.log(chalk.dim('  • EXCLUDED: .env (BOT_TOKEN), state/downloads, state/stdout.log'));
      console.log();
      console.log(chalk.bold('Next: import into SiriusOS full'));
      console.log(chalk.cyan(`  siriusos import-agent ${tarballPath}`));
      console.log();
    } finally {
      // Always clean the staging dir
      try {
        rmSync(stagingRoot, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAgentName(arg: string | undefined): string {
  if (arg) return arg;
  if (!existsSync(SINGLE_HOME)) {
    console.error(chalk.red(`\nNo agents configured.\n`));
    process.exit(1);
  }
  const { readdirSync } = require('fs') as typeof import('fs');
  const entries = readdirSync(SINGLE_HOME, { withFileTypes: true })
    .filter((d: any) => d.isDirectory())
    .map((d: any) => d.name);
  if (entries.length === 0) {
    console.error(chalk.red(`\nNo agents to export.\n`));
    process.exit(1);
  }
  if (entries.length > 1) {
    console.error(chalk.red(`\nMultiple agents: ${entries.join(', ')}. Pass an agent name: siriusos-single export <name>\n`));
    process.exit(1);
  }
  return entries[0];
}

function readConfig(agentDir: string): AgentConfig {
  const configPath = join(agentDir, 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
