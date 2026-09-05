import { Command } from 'commander';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IPCClient } from '../daemon/ipc-server.js';
import { hardRestart, selfRestart } from '../bus/system.js';
import { resolvePaths } from '../utils/paths.js';
import { validateAgentName, validateInstanceId } from '../utils/validate.js';

interface RestartOptions {
  instance: string;
  fresh?: boolean;
}

export function writeRestartModeMarkers(
  agent: string,
  instance: string,
  mode: 'continue' | 'fresh',
): void {
  const paths = resolvePaths(agent, instance);
  mkdirSync(paths.stateDir, { recursive: true });
  const forceFreshPath = join(paths.stateDir, '.force-fresh');
  const forceContinuePath = join(paths.stateDir, '.force-continue');

  if (mode === 'fresh') {
    if (existsSync(forceContinuePath)) unlinkSync(forceContinuePath);
    hardRestart(paths, agent, 'fresh restart requested via siriusos restart');
    return;
  }

  // An explicit Continue action must override any stale fresh marker left by
  // a previously planned restart that never reached the daemon.
  if (existsSync(forceFreshPath)) unlinkSync(forceFreshPath);
  writeFileSync(forceContinuePath, 'continue restart requested via siriusos restart\n', 'utf-8');
  writeFileSync(join(paths.stateDir, '.user-restart'), 'restarted via siriusos restart\n', 'utf-8');
  selfRestart(paths, agent, 'continue restart requested via siriusos restart');
}

export const restartCommand = new Command('restart')
  .argument('<agent>', 'Agent name to restart')
  .option('--instance <id>', 'Instance ID', 'default')
  .option('--fresh', 'Start a clean session instead of continuing the current conversation')
  .description('Restart a running agent through the daemon. Continues the current conversation by default; --fresh starts a clean session. Re-reads config.json and .env without restarting the daemon.')
  .action(async (agent: string, options: RestartOptions) => {
    try {
      validateAgentName(agent);
      validateInstanceId(options.instance);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }

    const ipc = new IPCClient(options.instance);
    const daemonRunning = await ipc.isDaemonRunning();
    if (!daemonRunning) {
      console.error('Daemon is not running. Start it first: siriusos start');
      process.exit(1);
    }

    const mode = options.fresh ? 'fresh' : 'continue';
    writeRestartModeMarkers(agent, options.instance, mode);
    console.log(`Restarting agent ${agent} (${mode})`);

    const response = await ipc.send({
      type: 'restart-agent',
      agent,
      source: `siriusos restart --mode ${mode}`,
    });
    if (!response.success) {
      console.error(`Restart failed: ${response.error}`);
      process.exit(1);
    }
    console.log(`  ${response.data}`);
  });
