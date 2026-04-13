import type { AgentConfig } from '../../types/index.js';

export interface ProviderSpawnOptions {
  mode: 'fresh' | 'continue';
  prompt: string;
  config: AgentConfig;
  agentDir: string;
}

export interface ProviderStrategy {
  command(): string;
  buildArgs(opts: ProviderSpawnOptions): string[];
  prepareWorkspace?(opts: ProviderSpawnOptions): Promise<void>;
}
