import { Command } from 'commander';

export const initCommand = new Command('init')
  .description('Set up your Telegram agent (BOT_TOKEN, CHAT_ID, model)')
  .action(async () => {
    console.log('TODO: init wizard');
  });
