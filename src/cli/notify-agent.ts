import { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { resolvePaths } from '../utils/paths.js';
import { notifyAgent } from '../bus/agents.js';

export const notifyAgentCommand = new Command('notify-agent')
  .description('Send an urgent notification to an agent')
  .argument('<name>', 'Target agent name')
  .argument('<message>', 'Message to send')
  .option('--from <agent>', 'Sender agent name', 'cli')
  .option('--instance <id>', 'Instance ID', 'default')
  .option('--org <org>', 'Sender org (used for telemetry; omit to skip event log)')
  .action((name: string, message: string, options: { from: string; instance: string; org?: string }) => {
    const paths = resolvePaths(options.from, options.instance, options.org);
    const ctxRoot = join(homedir(), '.siriusos', options.instance);

    notifyAgent(paths, options.from, name, message, ctxRoot, options.org);
    console.log(`Signal sent to ${name}`);
  });
