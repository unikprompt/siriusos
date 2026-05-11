import { Command } from 'commander';

export const statusCommand = new Command('status')
  .description('Show agent status (uptime, last message, model)')
  .action(async () => {
    console.log('TODO: status display');
  });
