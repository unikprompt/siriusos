import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleSlashCommand, type SlashCommandDeps } from '../../../src/daemon/slash-commands.js';

let workDir: string;
let logs: string[];
let restartCalls: string[];
let telegramCalls: Array<{ chatId: string | number; text: string }>;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'slash-cmd-test-'));
  logs = [];
  restartCalls = [];
  telegramCalls = [];
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<SlashCommandDeps> = {}): SlashCommandDeps {
  return {
    agentName: 'codex',
    chatId: '270021643',
    ctxRoot: workDir,
    log: (m) => logs.push(m),
    restartAgent: async (n) => { restartCalls.push(n); },
    sendTelegram: async (chatId, text) => { telegramCalls.push({ chatId, text }); },
    ...overrides,
  };
}

describe('handleSlashCommand — passthrough', () => {
  it('does not handle plain text', async () => {
    const result = await handleSlashCommand('hola, cómo va', makeDeps());
    expect(result.handled).toBe(false);
    expect(result.transformedText).toBeUndefined();
    expect(restartCalls).toEqual([]);
    expect(telegramCalls).toEqual([]);
  });

  it('does not handle empty string', async () => {
    const result = await handleSlashCommand('', makeDeps());
    expect(result.handled).toBe(false);
  });

  it('passes through slash commands not in the registered set', async () => {
    // Claude Code built-ins like /commit, /compact, /help must reach the agent.
    for (const cmd of ['/commit', '/compact', '/help', '/security-review']) {
      const result = await handleSlashCommand(cmd, makeDeps());
      expect(result.handled).toBe(false);
      expect(result.transformedText).toBeUndefined();
    }
    expect(restartCalls).toEqual([]);
    expect(telegramCalls).toEqual([]);
  });

  it('passes through unknown slash even with @botname suffix', async () => {
    const result = await handleSlashCommand('/unknown@my_bot extra', makeDeps());
    expect(result.handled).toBe(false);
  });
});

describe('handleSlashCommand — /clear', () => {
  it('writes .force-fresh + .restart-planned markers, calls restartAgent, replies via Telegram', async () => {
    const deps = makeDeps();
    const result = await handleSlashCommand('/clear', deps);

    expect(result.handled).toBe(true);
    // Allow the fire-and-forget promises to settle
    await new Promise((r) => setTimeout(r, 5));

    expect(existsSync(join(workDir, 'state', 'codex', '.force-fresh'))).toBe(true);
    expect(existsSync(join(workDir, 'state', 'codex', '.restart-planned'))).toBe(true);
    expect(restartCalls).toEqual(['codex']);
    expect(telegramCalls).toHaveLength(1);
    expect(telegramCalls[0].chatId).toBe('270021643');
    expect(telegramCalls[0].text).toContain('fresca');
  });

  it('captures user-supplied reason in the marker body', async () => {
    const deps = makeDeps();
    await handleSlashCommand('/clear context blew up', deps);
    await new Promise((r) => setTimeout(r, 5));

    const body = readFileSync(join(workDir, 'state', 'codex', '.force-fresh'), 'utf-8');
    expect(body).toContain('context blew up');
  });

  it('honors @botname suffix on the command', async () => {
    const result = await handleSlashCommand('/clear@codex_bot', makeDeps());
    expect(result.handled).toBe(true);
  });
});

describe('handleSlashCommand — /restart', () => {
  it('writes .user-restart marker, calls restartAgent, replies via Telegram', async () => {
    const deps = makeDeps();
    const result = await handleSlashCommand('/restart', deps);

    expect(result.handled).toBe(true);
    await new Promise((r) => setTimeout(r, 5));

    expect(existsSync(join(workDir, 'state', 'codex', '.user-restart'))).toBe(true);
    // Crucially, .force-fresh must NOT be written (that would defeat
    // history preservation).
    expect(existsSync(join(workDir, 'state', 'codex', '.force-fresh'))).toBe(false);
    expect(restartCalls).toEqual(['codex']);
    expect(telegramCalls[0].text).toContain('preservando historia');
  });

  it('captures user-supplied reason in the marker body', async () => {
    const deps = makeDeps();
    await handleSlashCommand('/restart pulling latest config', deps);
    await new Promise((r) => setTimeout(r, 5));

    const body = readFileSync(join(workDir, 'state', 'codex', '.user-restart'), 'utf-8');
    expect(body).toContain('pulling latest config');
  });
});

describe('handleSlashCommand — /status', () => {
  it('replies with formatted heartbeat snapshot when file exists', async () => {
    const stateDir = join(workDir, 'state', 'codex');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'heartbeat.json'),
      JSON.stringify({
        status: 'ok',
        current_task: 'investigating bug X',
        last_heartbeat: '2026-05-09T17:00:00Z',
        mode: 'day',
        uptime_seconds: 3600,
      }),
    );

    const deps = makeDeps();
    const result = await handleSlashCommand('/status', deps);

    expect(result.handled).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(restartCalls).toEqual([]);
    expect(telegramCalls).toHaveLength(1);
    const reply = telegramCalls[0].text;
    expect(reply).toContain('Agent codex');
    expect(reply).toContain('status=ok');
    expect(reply).toContain('mode=day');
    expect(reply).toContain('uptime=60min');
    expect(reply).toContain('investigating bug X');
  });

  it('replies with a graceful message when no heartbeat file exists', async () => {
    const result = await handleSlashCommand('/status', makeDeps());
    expect(result.handled).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(telegramCalls[0].text).toContain('no heartbeat on disk');
  });

  it('handles corrupted heartbeat JSON gracefully', async () => {
    const stateDir = join(workDir, 'state', 'codex');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, 'heartbeat.json'), 'not json');

    const result = await handleSlashCommand('/status', makeDeps());
    expect(result.handled).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(telegramCalls[0].text).toContain('no heartbeat on disk');
  });

  it('honors a custom heartbeat reader (test seam)', async () => {
    const customReader = vi.fn().mockReturnValue({
      status: 'degraded',
      current_task: 'rate-limit waiting',
    });
    const deps = makeDeps({ readHeartbeat: customReader });

    await handleSlashCommand('/status', deps);
    await new Promise((r) => setTimeout(r, 5));

    expect(customReader).toHaveBeenCalledWith(workDir, 'codex');
    expect(telegramCalls[0].text).toContain('status=degraded');
    expect(telegramCalls[0].text).toContain('rate-limit waiting');
  });
});

describe('handleSlashCommand — /plan', () => {
  it('returns transformedText with the planning injection on bare /plan', async () => {
    const result = await handleSlashCommand('/plan', makeDeps());
    expect(result.handled).toBe(false);
    expect(result.transformedText).toContain('EnterPlanMode');
    expect(result.transformedText).toContain('Planifica tu respuesta');
    // No daemon side-effects: no restart, no Telegram reply.
    expect(restartCalls).toEqual([]);
    expect(telegramCalls).toEqual([]);
  });

  it('appends user remainder after the planning injection', async () => {
    const result = await handleSlashCommand('/plan refactor the auth flow', makeDeps());
    expect(result.handled).toBe(false);
    expect(result.transformedText).toContain('EnterPlanMode');
    expect(result.transformedText?.endsWith('refactor the auth flow')).toBe(true);
    // Injection comes first
    const idx = (result.transformedText ?? '').indexOf('refactor the auth flow');
    const injIdx = (result.transformedText ?? '').indexOf('EnterPlanMode');
    expect(injIdx).toBeLessThan(idx);
  });

  it('honors @botname suffix on /plan', async () => {
    const result = await handleSlashCommand('/plan@codex_bot do X', makeDeps());
    expect(result.handled).toBe(false);
    expect(result.transformedText).toContain('EnterPlanMode');
    expect(result.transformedText).toContain('do X');
  });
});

describe('handleSlashCommand — error tolerance', () => {
  it('does not throw if sendTelegram rejects', async () => {
    const deps = makeDeps({
      sendTelegram: () => Promise.reject(new Error('telegram down')),
    });
    const result = await handleSlashCommand('/status', deps);
    expect(result.handled).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    // The handler logged the failure, did not throw upstream.
    expect(logs.some((l) => l.includes('telegram down') || l.includes('reply failed'))).toBe(true);
  });

  it('does not throw if restartAgent rejects', async () => {
    const deps = makeDeps({
      restartAgent: () => Promise.reject(new Error('boom')),
    });
    const result = await handleSlashCommand('/restart', deps);
    expect(result.handled).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(logs.some((l) => l.includes('/restart failed'))).toBe(true);
  });
});
