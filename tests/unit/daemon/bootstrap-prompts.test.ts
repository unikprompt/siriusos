import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
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
  const shouldContinue = (config: AgentConfig): boolean => {
    const proc = new AgentProcess('test-agent', makeEnv(), config);
    return (proc as unknown as { shouldContinue(): boolean }).shouldContinue();
  };

  describe('explicit restart modes', () => {
    it('consumes .force-continue and selects continuation for any runtime', () => {
      const marker = join(tmpRoot, 'state', 'test-agent', '.force-continue');
      writeFileSync(marker, 'dashboard continue\n', 'utf-8');
      expect(shouldContinue({ runtime: 'codex', provider: 'openai' })).toBe(true);
      expect(existsSync(marker)).toBe(false);
    });

    it('gives .force-fresh precedence and clears a stale continue marker', () => {
      const stateDir = join(tmpRoot, 'state', 'test-agent');
      const fresh = join(stateDir, '.force-fresh');
      const contMarker = join(stateDir, '.force-continue');
      writeFileSync(fresh, 'dashboard fresh\n', 'utf-8');
      writeFileSync(contMarker, 'stale continue\n', 'utf-8');
      expect(shouldContinue({ runtime: 'codex', provider: 'openai' })).toBe(false);
      expect(existsSync(fresh)).toBe(false);
      expect(existsSync(contMarker)).toBe(false);
    });
  });

  describe('anthropic (default) keeps the full bootstrap', () => {
    it('startup prompt tells agent crons are daemon-managed (no CronCreate)', () => {
      const p = startup({});
      expect(p).toContain('External crons are auto-loaded by the daemon');
      expect(p).toContain('do NOT call CronCreate');
      expect(p).toContain('AGENTS.md and all bootstrap files');
    });

    it('continue prompt mentions SESSION CONTINUATION and full history', () => {
      const p = cont({});
      expect(p).toContain('SESSION CONTINUATION');
      expect(p).toContain('conversation history is preserved');
      expect(p).toContain('External crons are auto-loaded by the daemon');
    });
  });

  describe('openai gets a lightweight bootstrap', () => {
    it('startup prompt reads only IDENTITY because AGENTS is already loaded', () => {
      const p = startup({ provider: 'openai' });
      expect(p).toContain('IDENTITY.md');
      expect(p).toContain('AGENTS.md is already loaded automatically');
      expect(p).toContain('Do not read CLAUDE.md');
      expect(p).toContain('Read ONLY IDENTITY.md');
    });

    it('startup prompt tells the agent NOT to use /loop or CronCreate', () => {
      const p = startup({ provider: 'openai' });
      expect(p).toContain('Do NOT');
      expect(p).toMatch(/\/loop|CronCreate|CronList/);
      expect(p).toContain('daemon');
    });

    it('loads the compact strategic core for an OpenAI orchestrator', () => {
      const p = startup({ provider: 'openai', role: 'orchestrator' });
      for (const file of ['IDENTITY.md', 'SOUL.md', 'USER.md', 'GOALS.md', 'GUARDRAILS.md', 'MEMORY.md']) {
        expect(p).toContain(file);
      }
      expect(p).toContain("today's memory/YYYY-MM-DD.md");
      expect(p).toContain('Do not bulk-read CLAUDE.md');
      expect(p).toContain('HEARTBEAT.md, TOOLS.md, SYSTEM.md, plugins, docs');
    });

    it('re-loads the compact strategic core for an OpenAI orchestrator restart', () => {
      const p = cont({ provider: 'openai', role: 'orchestrator' });
      expect(p).toContain('compact orchestration core');
      expect(p).toContain('SOUL.md');
      expect(p).toContain('GOALS.md');
      expect(p).toContain('MEMORY.md');
    });

    it('loads the compact operational core for a persistent OpenAI specialist', () => {
      const p = startup({ provider: 'openai', role: 'specialist' });
      expect(p).toContain('core operational files');
      for (const file of ['IDENTITY.md', 'SOUL.md', 'USER.md', 'GOALS.md', 'GUARDRAILS.md', 'MEMORY.md']) {
        expect(p).toContain(file);
      }
      expect(p).toContain("today's memory/YYYY-MM-DD.md");
      expect(p).not.toContain('Read ONLY IDENTITY.md');
    });

    it('re-loads the compact operational core for an OpenAI specialist restart', () => {
      const p = cont({ provider: 'openai', role: 'specialist' });
      expect(p).toContain('compact operational core');
      expect(p).toContain('SOUL.md');
      expect(p).toContain('GOALS.md');
      expect(p).toContain('MEMORY.md');
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
      // Still re-orients with the one file not already injected by Codex.
      expect(p).toContain('IDENTITY.md');
      expect(p).toContain('AGENTS.md is already loaded automatically');
      expect(p).toContain('Do not read CLAUDE.md');
    });

    it('eager-read list is 3 files for openai vs ALL bootstrap files for anthropic', () => {
      // Actual token savings live in what the agent ends up reading, not in
      // the prompt text itself (which is a similar length either way). Assert
      // the behavioral contract: openai re-reads a fixed minimal set, anthropic
      // re-reads everything the template lists in AGENTS.md.
      const openaiCont = cont({ provider: 'openai' });
      const anthropicCont = cont({});
      expect(openaiCont).toContain('Re-read ONLY IDENTITY.md');
      expect(anthropicCont).toContain('ALL bootstrap files');
      expect(anthropicCont).not.toContain('Re-read ONLY IDENTITY.md');
    });

    it('consumes and injects a handoff marker before the lightweight bootstrap', () => {
      const handoff = join(tmpRoot, 'handoff.md');
      const marker = join(tmpRoot, 'state', 'test-agent', '.handoff-doc-path');
      writeFileSync(handoff, '# Fresh handoff\n', 'utf-8');
      writeFileSync(marker, `${handoff}\n`, 'utf-8');
      const p = startup({ provider: 'openai' });
      expect(p).toContain('CONTEXT HANDOFF');
      expect(p).toContain(handoff);
      expect(p).toContain('brief conversational Telegram pickup message');
      expect(existsSync(marker)).toBe(false);
    });
  });
});
