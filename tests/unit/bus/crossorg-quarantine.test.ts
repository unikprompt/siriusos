import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { sendMessage, checkInbox, listQuarantine, releaseQuarantine } from '../../../src/bus/message';
import { resolveCrossOrgGuard } from '../../../src/bus/crossorg-guard';
import type { BusPaths, InboxMessage } from '../../../src/types';

// xorg guard: the cross-org quarantine sets aside a message whose stamped
// sender-org differs from the recipient's org — but only in 'quarantine' mode,
// only when the message carries an org, only when it differs, and only when the
// sender-org is not whitelisted. A message with no org, or 'mark' mode, is
// delivered exactly as before. The guard is off by default (mode 'mark').
describe('cross-org quarantine guard', () => {
  let dir: string;
  let paths: BusPaths;
  const AGENT = 'developer';
  const savedOrg = process.env.CTX_ORG;
  const savedFR = process.env.CTX_FRAMEWORK_ROOT;

  function makePaths(root: string): BusPaths {
    return {
      ctxRoot: root,
      inbox: join(root, 'inbox', AGENT),
      inflight: join(root, 'inflight', AGENT),
      processed: join(root, 'processed', AGENT),
      quarantine: join(root, 'inbox-quarantine', AGENT),
      logDir: join(root, 'logs', AGENT),
      stateDir: join(root, 'state', AGENT),
      taskDir: join(root, 'tasks'),
      approvalDir: join(root, 'approvals'),
      analyticsDir: join(root, 'analytics'),
      deliverablesDir: join(root, 'deliverables'),
    };
  }

  // Drop a message straight into the inbox (bypasses sendMessage so we control
  // the org field exactly). No sig -> checkInbox accepts it (no signing key here).
  function dropMsg(over: Partial<InboxMessage> & { id: string }): void {
    mkdirSync(paths.inbox, { recursive: true });
    const msg: InboxMessage = {
      id: over.id,
      from: over.from ?? 'orquestador',
      to: AGENT,
      priority: 'normal',
      timestamp: '2026-09-16T00:00:00.000Z',
      text: over.text ?? 'hello',
      reply_to: null,
      ...(over.org !== undefined ? { org: over.org } : {}),
    };
    writeFileSync(join(paths.inbox, `2-1700000000000-from-${msg.from}-${over.id.slice(-5)}.json`), JSON.stringify(msg));
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xorg-'));
    paths = makePaths(dir);
    // sendMessage tags identity via classifyIdentity; keep it from finding a
    // framework so the identity tag path is deterministic (irrelevant to org).
    process.env.CTX_FRAMEWORK_ROOT = join(dir, 'no-framework');
    process.env.CTX_ORG = 'unikprompt';
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedOrg === undefined) delete process.env.CTX_ORG; else process.env.CTX_ORG = savedOrg;
    if (savedFR === undefined) delete process.env.CTX_FRAMEWORK_ROOT; else process.env.CTX_FRAMEWORK_ROOT = savedFR;
  });

  it('sendMessage stamps the sender org when given, and omits it otherwise', () => {
    const id1 = sendMessage(paths, 'orquestador', AGENT, 'normal', 'with org', undefined, 'observatorio-ia');
    const id2 = sendMessage(paths, 'orquestador', AGENT, 'normal', 'no org');
    const files = readdirSync(paths.inbox).filter(f => f.endsWith('.json')).sort();
    const msgs = files.map(f => JSON.parse(readFileSync(join(paths.inbox, f), 'utf-8')) as InboxMessage);
    const withOrg = msgs.find(m => m.id === id1)!;
    const noOrg = msgs.find(m => m.id === id2)!;
    expect(withOrg.org).toBe('observatorio-ia');
    expect('org' in noOrg).toBe(false);
  });

  it('quarantine mode: a cross-org message is set aside, not delivered', () => {
    dropMsg({ id: 'm1aaaaa', from: 'observatorio-ia', org: 'observatorio-ia' });
    const quarantined: InboxMessage[] = [];
    const delivered = checkInbox(paths, {
      recipientOrg: 'unikprompt',
      mode: 'quarantine',
      onQuarantine: (m) => quarantined.push(m),
    });
    expect(delivered).toHaveLength(0);
    expect(quarantined.map(m => m.id)).toEqual(['m1aaaaa']);
    expect(listQuarantine(paths).map(m => m.id)).toEqual(['m1aaaaa']);
    // Not left in the inbox, not moved to inflight.
    expect(readdirSync(paths.inbox).filter(f => f.endsWith('.json'))).toHaveLength(0);
    expect(existsSync(paths.inflight) ? readdirSync(paths.inflight).filter(f => f.endsWith('.json')) : []).toHaveLength(0);
  });

  it('same-org message is delivered normally in quarantine mode', () => {
    dropMsg({ id: 'm2bbbbb', from: 'orquestador', org: 'unikprompt' });
    const delivered = checkInbox(paths, { recipientOrg: 'unikprompt', mode: 'quarantine' });
    expect(delivered.map(m => m.id)).toEqual(['m2bbbbb']);
    expect(listQuarantine(paths)).toHaveLength(0);
  });

  it('a message with no org is delivered (never quarantined), even in quarantine mode', () => {
    dropMsg({ id: 'm3ccccc', from: 'legacy-sender' }); // no org
    const delivered = checkInbox(paths, { recipientOrg: 'unikprompt', mode: 'quarantine' });
    expect(delivered.map(m => m.id)).toEqual(['m3ccccc']);
    expect(listQuarantine(paths)).toHaveLength(0);
  });

  it('a whitelisted sender-org is delivered even when cross-org', () => {
    dropMsg({ id: 'm4ddddd', from: 'sirius-lex', org: 'sirius-lex' });
    const delivered = checkInbox(paths, {
      recipientOrg: 'unikprompt',
      mode: 'quarantine',
      whitelist: ['sirius-lex'],
    });
    expect(delivered.map(m => m.id)).toEqual(['m4ddddd']);
    expect(listQuarantine(paths)).toHaveLength(0);
  });

  it("mark mode (the default) delivers a cross-org message as today — no quarantine", () => {
    dropMsg({ id: 'm5eeeee', from: 'observatorio-ia', org: 'observatorio-ia' });
    // Explicit mark mode…
    const delivered = checkInbox(paths, { recipientOrg: 'unikprompt', mode: 'mark' });
    expect(delivered.map(m => m.id)).toEqual(['m5eeeee']);
    expect(listQuarantine(paths)).toHaveLength(0);
  });

  it('no guard argument at all behaves exactly as before (delivers cross-org)', () => {
    dropMsg({ id: 'm6fffff', from: 'observatorio-ia', org: 'observatorio-ia' });
    const delivered = checkInbox(paths);
    expect(delivered.map(m => m.id)).toEqual(['m6fffff']);
    expect(listQuarantine(paths)).toHaveLength(0);
  });

  it('releaseQuarantine moves a quarantined message back to the inbox for re-delivery', () => {
    dropMsg({ id: 'm7ggggg', from: 'observatorio-ia', org: 'observatorio-ia' });
    checkInbox(paths, { recipientOrg: 'unikprompt', mode: 'quarantine' });
    expect(listQuarantine(paths).map(m => m.id)).toEqual(['m7ggggg']);

    expect(releaseQuarantine(paths, 'm7ggggg')).toBe(true);
    expect(listQuarantine(paths)).toHaveLength(0);
    // Now in the inbox again; a mark-mode check delivers it.
    const delivered = checkInbox(paths, { recipientOrg: 'unikprompt', mode: 'mark' });
    expect(delivered.map(m => m.id)).toEqual(['m7ggggg']);

    // Releasing an unknown id is a clean false.
    expect(releaseQuarantine(paths, 'does-not-exist')).toBe(false);
  });
});

describe('resolveCrossOrgGuard (config from context.json)', () => {
  let fw: string;
  beforeEach(() => { fw = mkdtempSync(join(tmpdir(), 'xorg-cfg-')); });
  afterEach(() => { rmSync(fw, { recursive: true, force: true }); });

  function writeCtx(org: string, content: unknown) {
    const dir = join(fw, 'orgs', org);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'context.json'), JSON.stringify(content));
  }

  it('defaults to mark when there is no context.json', () => {
    expect(resolveCrossOrgGuard(fw, 'unikprompt')).toEqual({ mode: 'mark', whitelist: [] });
  });

  it('defaults to mark when context.json has no guard block', () => {
    writeCtx('unikprompt', { timezone: 'America/New_York' });
    expect(resolveCrossOrgGuard(fw, 'unikprompt')).toEqual({ mode: 'mark', whitelist: [] });
  });

  it('reads quarantine mode and whitelist from the guard block', () => {
    writeCtx('unikprompt', { guard: { crossorg_mode: 'quarantine', crossorg_whitelist: ['sirius-lex', 'me'] } });
    expect(resolveCrossOrgGuard(fw, 'unikprompt')).toEqual({ mode: 'quarantine', whitelist: ['sirius-lex', 'me'] });
  });

  it('an invalid mode falls back to mark; a non-array whitelist becomes empty', () => {
    writeCtx('unikprompt', { guard: { crossorg_mode: 'nonsense', crossorg_whitelist: 'not-an-array' } });
    expect(resolveCrossOrgGuard(fw, 'unikprompt')).toEqual({ mode: 'mark', whitelist: [] });
  });

  it('empty frameworkRoot or org yields the safe default', () => {
    expect(resolveCrossOrgGuard('', 'unikprompt')).toEqual({ mode: 'mark', whitelist: [] });
    expect(resolveCrossOrgGuard(fw, '')).toEqual({ mode: 'mark', whitelist: [] });
  });
});
