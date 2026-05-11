import { Command } from 'commander';

export const exportCommand = new Command('export')
  .description('Export your agent as a tarball for upgrade to SiriusOS full')
  .action(async () => {
    console.log('TODO: export tarball');
  });
