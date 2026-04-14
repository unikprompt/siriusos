import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AgentProcess } from '../../../src/daemon/agent-process';
import type { AgentConfig, CtxEnv } from '../../../src/types';

describe('AgentProcess bootstrap prompts', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'cortextos-bootstrap-test-'));
    // Pre-create an .onboarded marker so prompt builders don't try to append onboarding.
    const stateDir = join(tmpRoot, 'state', 'test-agent');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, '.onboarded'), '', 'utf-8');
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  const makeEnv = (): CtxEnv => ({
    instanceId: 'test-instance',
    ctxRoot: tmpRoot,
    frameworkRoot: tmpRoot,
    agentName: 'test-agent',
    agentDir: join(tmpRoot, 'agent-dir'),
    org: 'test-org',
    projectRoot: tmpRoot,
  });

  // Access private methods via `as any` — acceptable in tests, lock in the
  // lightweight-bootstrap behavior that matters for token-cost reasons.
  const startup = (config: AgentConfig): string => {
    const proc = new AgentProcess('test-agent', makeEnv(), config);
    return (proc as unknown as { buildStartupPrompt(): string }).buildStartupPrompt();
  };
  const cont = (config: AgentConfig): string => {
    const proc = new AgentProcess('test-agent', makeEnv(), config);
    return (proc as unknown as { buildContinuePrompt(): string }).buildContinuePrompt();
  };

  describe('anthropic (default) keeps the full bootstrap', () => {
    it('startup prompt mentions /loop and CronCreate', () => {
      const p = startup({});
      expect(p).toContain('/loop');
      expect(p).toContain('CronCreate');
      expect(p).toContain('AGENTS.md and all bootstrap files');
    });

    it('continue prompt mentions SESSION CONTINUATION and full history', () => {
      const p = cont({});
      expect(p).toContain('SESSION CONTINUATION');
      expect(p).toContain('conversation history is preserved');
      expect(p).toContain('/loop');
    });
  });

  describe('openai gets a lightweight bootstrap', () => {
    it('startup prompt only lists IDENTITY, CLAUDE, AGENTS', () => {
      const p = startup({ provider: 'openai' });
      expect(p).toContain('IDENTITY.md');
      expect(p).toContain('CLAUDE.md');
      expect(p).toContain('AGENTS.md');
      // Explicit "read ONLY these three" guidance
      expect(p).toContain('ONLY these three files');
    });

    it('startup prompt tells the agent NOT to use /loop or CronCreate', () => {
      const p = startup({ provider: 'openai' });
      expect(p).toContain('Do NOT');
      expect(p).toMatch(/\/loop|CronCreate|CronList/);
      expect(p).toContain('daemon');
    });

    it('startup prompt omits the heavier bootstrap file list', () => {
      const p = startup({ provider: 'openai' });
      // These files should NOT be in the eager-read list for openai
      // (they are available on demand but not on every restart)
      expect(p).not.toContain('all bootstrap files listed there');
    });

    it('continue prompt does NOT claim conversation history is preserved (it is not)', () => {
      const p = cont({ provider: 'openai' });
      expect(p).not.toContain('full conversation history is preserved');
      expect(p).not.toContain('SESSION CONTINUATION:');
      // Still re-orients with the 3 essential files
      expect(p).toContain('IDENTITY.md');
      expect(p).toContain('CLAUDE.md');
      expect(p).toContain('AGENTS.md');
    });

    it('eager-read list is 3 files for openai vs ALL bootstrap files for anthropic', () => {
      // Actual token savings live in what the agent ends up reading, not in
      // the prompt text itself (which is a similar length either way). Assert
      // the behavioral contract: openai re-reads a fixed small set, anthropic
      // re-reads everything the template lists in AGENTS.md.
      const openaiCont = cont({ provider: 'openai' });
      const anthropicCont = cont({});
      expect(openaiCont).toContain('ONLY these three files');
      expect(anthropicCont).toContain('ALL bootstrap files');
      expect(anthropicCont).not.toContain('ONLY these three files');
    });
  });
});
