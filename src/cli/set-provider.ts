import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { atomicWriteSync } from '../utils/atomic.js';

export const setProviderCommand = new Command('set-provider')
  .description('Switch an agent between backend providers (anthropic | openai). Restart the agent for changes to take effect.')
  .argument('<agent>', 'Agent name')
  .argument('<provider>', 'Backend provider: anthropic | openai')
  .option('--org <org>', 'Org name (defaults to CTX_ORG env)')
  .option('--model <model>', 'Also set model (e.g. gpt-5.3-codex for openai)')
  .action((agentName: string, provider: string, opts: { org?: string; model?: string }) => {
    if (provider !== 'anthropic' && provider !== 'openai') {
      console.error(`Error: provider must be 'anthropic' or 'openai' (got '${provider}')`);
      process.exit(1);
    }
    const frameworkRoot = process.env.CTX_FRAMEWORK_ROOT || process.cwd();
    const org = opts.org || process.env.CTX_ORG || '';
    if (!org) {
      console.error(`Error: --org is required (or set CTX_ORG)`);
      process.exit(1);
    }

    const configPath = join(frameworkRoot, 'orgs', org, 'agents', agentName, 'config.json');
    if (!existsSync(configPath)) {
      console.error(`Error: agent config not found at ${configPath}`);
      process.exit(1);
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (err) {
      console.error(`Error: failed to parse ${configPath}: ${(err as Error).message}`);
      process.exit(1);
    }

    const previousProvider = config.provider ?? 'anthropic';
    const previousModel = config.model;
    config.provider = provider;
    if (opts.model) config.model = opts.model;

    atomicWriteSync(configPath, JSON.stringify(config, null, 2) + '\n');

    console.log(`Agent "${agentName}" provider: ${previousProvider} → ${provider}`);
    if (opts.model) {
      console.log(`Agent "${agentName}" model: ${previousModel ?? '(unset)'} → ${opts.model}`);
    }
    console.log(`Restart the agent for changes to take effect:`);
    console.log(`  cortextos stop ${agentName} && cortextos start ${agentName}`);
  });
