import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { exportCommand } from './commands/export.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('siriusos-single')
  .description('Lite version of SiriusOS — one Telegram agent + Claude Code')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(exportCommand);
program.addCommand(statusCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
