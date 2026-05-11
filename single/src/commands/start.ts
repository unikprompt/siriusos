import { Command } from 'commander';

export const startCommand = new Command('start')
  .description('Start your agent (boots Telegram poller + Claude Code PTY)')
  .action(async () => {
    console.log('TODO: start loop');
  });
