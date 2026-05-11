import { Command } from 'commander';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { listMemoryFiles } from '../memory/daily.js';
import type { AgentConfig } from '../types.js';

const SINGLE_HOME = join(homedir(), '.siriusos-single');

export const statusCommand = new Command('status')
  .description('Show agent status (model, last activity, memory size)')
  .argument('[agent_name]', 'Agent name (defaults to all configured agents)')
  .action((agentNameArg: string | undefined) => {
    if (!existsSync(SINGLE_HOME)) {
      console.log(chalk.dim('\nNo agents configured. Run `siriusos-single init` to get started.\n'));
      return;
    }

    const { readdirSync } = require('fs') as typeof import('fs');
    const allAgents = readdirSync(SINGLE_HOME, { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name);

    const agents = agentNameArg ? [agentNameArg] : allAgents;

    if (agents.length === 0) {
      console.log(chalk.dim('\nNo agents configured.\n'));
      return;
    }

    console.log();
    console.log(chalk.bold('SiriusOS Single — agent status'));
    console.log();

    for (const name of agents) {
      const agentDir = join(SINGLE_HOME, name);
      if (!existsSync(agentDir)) {
        console.log(chalk.red(`  ✗ ${name} — not found`));
        continue;
      }

      const config = readConfig(agentDir);
      const memoryFiles = listMemoryFiles(agentDir);
      const lastMemory = memoryFiles.length > 0 ? memoryFiles[memoryFiles.length - 1] : null;
      const stdoutLog = join(agentDir, 'state', 'stdout.log');
      const lastActivity = existsSync(stdoutLog)
        ? formatRelative(statSync(stdoutLog).mtimeMs)
        : 'never';

      console.log(chalk.cyan(`  ${name}`));
      console.log(`    Model:           ${config.model || '(default)'}`);
      console.log(`    Language:        ${config.language || 'es'}`);
      console.log(`    Created:         ${config.created_at ? formatRelative(Date.parse(config.created_at)) : 'unknown'}`);
      console.log(`    Memory files:    ${memoryFiles.length}${lastMemory ? ` (latest: ${lastMemory})` : ''}`);
      console.log(`    Last PTY output: ${lastActivity}`);
      console.log(`    Location:        ${agentDir}`);
      console.log();
    }
  });

function readConfig(agentDir: string): AgentConfig {
  const configPath = join(agentDir, 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function formatRelative(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
