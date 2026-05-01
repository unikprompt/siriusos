import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { createInterface } from 'readline';
import { validateAgentName, validateOrgName, validateInstanceId } from '../utils/validate.js';
import { IPCClient } from '../daemon/ipc-server.js';
import { writeStopMarker } from './stop.js';

interface PurgeAgentOptions {
  instance: string;
  org?: string;
  dryRun?: boolean;
  yes?: boolean;
  keepState?: boolean;
  keepDefinition?: boolean;
}

interface PurgeOrgOptions {
  instance: string;
  dryRun?: boolean;
  yes?: boolean;
}

interface PurgeTarget {
  path: string;
  label: string;
  bytes: number;
  exists: boolean;
}

export const purgeCommand = new Command('purge')
  .description('Remove all state for an agent or an organization (transcripts, memory, logs, config entry).');

purgeCommand
  .command('agent')
  .argument('<name>', 'Agent name to purge')
  .option('--instance <id>', 'Instance ID', 'default')
  .option('--org <org>', 'Organization name (auto-detected if omitted)')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--keep-state', 'Preserve runtime state directory (logs, memory, mailboxes); remove agent definition only')
  .option('--keep-definition', 'Preserve orgs/<org>/agents/<name> definition; wipe runtime state only')
  .description('Purge all state for an agent (state, logs, mailboxes, definition, registry entry)')
  .action(async (name: string, options: PurgeAgentOptions) => {
    try {
      validateAgentName(name);
      validateInstanceId(options.instance);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }

    if (options.keepState && options.keepDefinition) {
      console.error('Error: --keep-state and --keep-definition are mutually exclusive (nothing left to purge).');
      process.exit(2);
    }

    const projectRoot = process.env.CTX_FRAMEWORK_ROOT || process.env.CTX_PROJECT_ROOT || process.cwd();
    const ctxRoot = join(homedir(), '.cortextos', options.instance);

    const org = options.org || autoDetectOrgForAgent(projectRoot, name);
    if (org) {
      try {
        validateOrgName(org);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    const targets = collectAgentTargets(ctxRoot, projectRoot, org, name, {
      keepState: options.keepState,
      keepDefinition: options.keepDefinition,
    });

    const enabledFile = join(ctxRoot, 'config', 'enabled-agents.json');
    const willTouchEnabledFile = !options.keepDefinition && existsSync(enabledFile)
      && hasEnabledAgentEntry(enabledFile, name);

    const realTargets = targets.filter(t => t.exists);

    if (realTargets.length === 0 && !willTouchEnabledFile) {
      console.log(`No state found for agent "${name}" (instance: ${options.instance}). Nothing to purge.`);
      return;
    }

    console.log(`\nPurge plan for agent: ${name}`);
    console.log(`  Instance: ${options.instance}`);
    if (org) console.log(`  Organization: ${org}`);
    if (options.keepState) console.log('  Mode: --keep-state (definition only)');
    if (options.keepDefinition) console.log('  Mode: --keep-definition (runtime state only)');
    console.log('');
    console.log('  Will remove:');
    for (const t of realTargets) {
      console.log(`    - ${t.label}: ${t.path}  (${formatBytes(t.bytes)})`);
    }
    if (willTouchEnabledFile) {
      console.log(`    - registry entry "${name}" in ${enabledFile}`);
    }
    console.log('');

    if (options.dryRun) {
      console.log('  --dry-run: nothing was deleted.');
      return;
    }

    if (!options.yes) {
      const ok = await confirm(`  Confirm purge of agent "${name}"? [y/N] `);
      if (!ok) {
        console.log('  Aborted.');
        return;
      }
    }

    if (!options.keepDefinition) {
      await stopAgentIfRunning(options.instance, name);
    }

    for (const t of realTargets) {
      try {
        rmSync(t.path, { recursive: true, force: true });
        console.log(`  Removed ${t.label}: ${t.path}`);
      } catch (err) {
        console.error(`  Failed to remove ${t.path}: ${(err as Error).message}`);
      }
    }

    if (willTouchEnabledFile) {
      try {
        removeEnabledAgentEntry(enabledFile, name);
        console.log(`  Removed registry entry "${name}" from enabled-agents.json`);
      } catch (err) {
        console.error(`  Failed to update ${enabledFile}: ${(err as Error).message}`);
      }
    }

    console.log(`\n  Agent "${name}" purged.`);
  });

purgeCommand
  .command('org')
  .argument('<name>', 'Organization name to purge')
  .option('--instance <id>', 'Instance ID', 'default')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .option('-y, --yes', 'Skip confirmation prompt')
  .description('Purge an organization and every agent under it')
  .action(async (name: string, options: PurgeOrgOptions) => {
    try {
      validateOrgName(name);
      validateInstanceId(options.instance);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }

    const projectRoot = process.env.CTX_FRAMEWORK_ROOT || process.env.CTX_PROJECT_ROOT || process.cwd();
    const orgDir = join(projectRoot, 'orgs', name);
    const ctxRoot = join(homedir(), '.cortextos', options.instance);

    if (!existsSync(orgDir)) {
      console.log(`Organization "${name}" not found at ${orgDir}. Nothing to purge.`);
      return;
    }

    const agentsDir = join(orgDir, 'agents');
    const agents = existsSync(agentsDir)
      ? readdirSync(agentsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
      : [];

    console.log(`\nPurge plan for organization: ${name}`);
    console.log(`  Instance: ${options.instance}`);
    console.log(`  Org directory: ${orgDir}  (${formatBytes(dirSize(orgDir))})`);
    if (agents.length > 0) {
      console.log(`  Agents (${agents.length}):`);
      for (const a of agents) {
        console.log(`    - ${a}`);
      }
    } else {
      console.log('  Agents: (none)');
    }
    console.log('');

    if (options.dryRun) {
      console.log('  --dry-run: nothing was deleted.');
      return;
    }

    if (!options.yes) {
      const ok = await confirm(`  Confirm purge of org "${name}" and ${agents.length} agent(s)? [y/N] `);
      if (!ok) {
        console.log('  Aborted.');
        return;
      }
    }

    for (const agent of agents) {
      console.log(`\n  Purging agent: ${agent}`);
      await stopAgentIfRunning(options.instance, agent);
      const targets = collectAgentTargets(ctxRoot, projectRoot, name, agent, {});
      for (const t of targets.filter(x => x.exists)) {
        try {
          rmSync(t.path, { recursive: true, force: true });
          console.log(`    Removed ${t.label}: ${t.path}`);
        } catch (err) {
          console.error(`    Failed to remove ${t.path}: ${(err as Error).message}`);
        }
      }
      const enabledFile = join(ctxRoot, 'config', 'enabled-agents.json');
      if (existsSync(enabledFile) && hasEnabledAgentEntry(enabledFile, agent)) {
        try {
          removeEnabledAgentEntry(enabledFile, agent);
          console.log(`    Removed registry entry "${agent}"`);
        } catch { /* ignore */ }
      }
    }

    try {
      rmSync(orgDir, { recursive: true, force: true });
      console.log(`\n  Removed org directory: ${orgDir}`);
    } catch (err) {
      console.error(`  Failed to remove ${orgDir}: ${(err as Error).message}`);
    }

    console.log(`\n  Organization "${name}" purged.`);
  });

function autoDetectOrgForAgent(projectRoot: string, agent: string): string | undefined {
  const orgsDir = join(projectRoot, 'orgs');
  if (!existsSync(orgsDir)) return undefined;
  const orgs = readdirSync(orgsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  const matches = orgs.filter(o => existsSync(join(orgsDir, o, 'agents', agent)));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0 && orgs.length === 1) return orgs[0];
  return undefined;
}

function collectAgentTargets(
  ctxRoot: string,
  projectRoot: string,
  org: string | undefined,
  name: string,
  flags: { keepState?: boolean; keepDefinition?: boolean },
): PurgeTarget[] {
  const targets: PurgeTarget[] = [];

  if (!flags.keepState) {
    const runtimeDirs = ['state', 'logs', 'inbox', 'outbox', 'inflight', 'processed', 'analytics'];
    for (const sub of runtimeDirs) {
      const path = join(ctxRoot, sub, name);
      targets.push(buildTarget(path, sub));
    }
  }

  if (!flags.keepDefinition && org) {
    const definitionPath = join(projectRoot, 'orgs', org, 'agents', name);
    targets.push(buildTarget(definitionPath, 'definition'));
  }

  return targets;
}

function buildTarget(path: string, label: string): PurgeTarget {
  const exists = existsSync(path);
  return { path, label, exists, bytes: exists ? dirSize(path) : 0 };
}

function dirSize(path: string): number {
  try {
    const stat = statSync(path);
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
    let total = 0;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      total += dirSize(join(path, entry.name));
    }
    return total;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function hasEnabledAgentEntry(enabledFile: string, name: string): boolean {
  try {
    const data = JSON.parse(readFileSync(enabledFile, 'utf-8'));
    return Object.prototype.hasOwnProperty.call(data, name);
  } catch {
    return false;
  }
}

function removeEnabledAgentEntry(enabledFile: string, name: string): void {
  const data = JSON.parse(readFileSync(enabledFile, 'utf-8'));
  if (Object.prototype.hasOwnProperty.call(data, name)) {
    delete data[name];
    writeFileSync(enabledFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
}

async function stopAgentIfRunning(instance: string, agent: string): Promise<void> {
  try {
    const ipc = new IPCClient(instance);
    const running = await ipc.isDaemonRunning();
    if (!running) return;
    writeStopMarker(instance, agent, 'stopped via cortextos purge');
    const response = await ipc.send({ type: 'stop-agent', agent, source: 'cortextos purge' });
    if (response.success) {
      console.log(`  Stopped running agent: ${agent}`);
    }
  } catch {
    // Daemon may not be available; safe to continue with file removal.
  }

  try {
    const pm2List = spawnSync('pm2', ['jlist'], { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
    if (pm2List.status === 0 && pm2List.stdout) {
      const processes = JSON.parse(pm2List.stdout) as { name: string }[];
      for (const p of processes) {
        if (p.name === `cortextos-${agent}` || p.name === `ctx-${instance}-${agent}`) {
          spawnSync('pm2', ['delete', p.name], { timeout: 5000, stdio: 'pipe' });
          console.log(`  Stopped PM2 process: ${p.name}`);
        }
      }
    }
  } catch {
    // PM2 not installed; skip.
  }
}

function confirm(prompt: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, answer => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}
