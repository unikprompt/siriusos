import type { AgentRuntime } from '@/lib/types';

const AGENT_RUNTIMES = new Set<AgentRuntime>([
  'claude-code',
  'codex',
  'codex-app-server',
  'hermes',
]);

/**
 * Match the daemon's legacy fallback while preserving every supported runtime.
 */
export function normalizeAgentRuntime(value: unknown): AgentRuntime {
  return typeof value === 'string' && AGENT_RUNTIMES.has(value as AgentRuntime)
    ? value as AgentRuntime
    : 'claude-code';
}

export function isCodexRuntime(runtime: AgentRuntime | undefined): boolean {
  return runtime === 'codex' || runtime === 'codex-app-server';
}
