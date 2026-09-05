import { describe, expect, it } from 'vitest';
import { isCodexRuntime, normalizeAgentRuntime } from '@/lib/agent-runtime';

describe('agent runtime helpers', () => {
  it.each(['claude-code', 'codex', 'codex-app-server', 'hermes'] as const)(
    'preserves the supported runtime %s',
    (runtime) => {
      expect(normalizeAgentRuntime(runtime)).toBe(runtime);
    },
  );

  it('uses the daemon legacy fallback for missing or unknown values', () => {
    expect(normalizeAgentRuntime(undefined)).toBe('claude-code');
    expect(normalizeAgentRuntime('unknown')).toBe('claude-code');
  });

  it('recognizes both OpenAI runtimes', () => {
    expect(isCodexRuntime('codex')).toBe(true);
    expect(isCodexRuntime('codex-app-server')).toBe(true);
    expect(isCodexRuntime('claude-code')).toBe(false);
  });
});
