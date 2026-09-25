import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

// E2E through the real built CLI (dist/cli.js): a message whose sender ran under
// a different CTX_ORG gets stamped with that org and, when the recipient org has
// guard.crossorg_mode="quarantine" in its context.json, is quarantined by
// check-inbox instead of delivered — then listed and released. This exercises the
// wiring the unit test cannot: env resolution, resolveCrossOrgGuard reading
// context.json, and the list/release CLI commands. HOME is redirected so
// resolvePaths' homedir()-based instance dir lands in the tempdir.
const cliPath = join(__dirname, '..', '..', 'dist', 'cli.js');
const INSTANCE = 'xorgtest';

describe('E2E cross-org quarantine (real CLI)', () => {
  let home: string;
  let framework: string;

  function ctxOrgFile(org: string, guard?: Record<string, unknown>) {
    const dir = join(framework, 'orgs', org);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'context.json'), JSON.stringify(guard ? { guard } : {}));
  }

  function run(org: string, agent: string, args: string[]): string {
    return execFileSync(process.execPath, [cliPath, 'bus', ...args], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: home,
        CTX_INSTANCE_ID: INSTANCE,
        CTX_ORG: org,
        CTX_AGENT_NAME: agent,
        CTX_FRAMEWORK_ROOT: framework,
      },
    }).trim();
  }

  function inboxQuarantineDir(agent: string) {
    return join(home, '.siriusos', INSTANCE, 'inbox-quarantine', agent);
  }
  function inboxDir(agent: string) {
    return join(home, '.siriusos', INSTANCE, 'inbox', agent);
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'xorg-e2e-'));
    framework = join(home, 'framework');
    mkdirSync(framework, { recursive: true });
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('quarantine mode: a message from another org is set aside, then listed and released', () => {
    ctxOrgFile('unikprompt', { crossorg_mode: 'quarantine' });
    ctxOrgFile('observatorio-ia');

    // Sender in org observatorio-ia sends to developer (unikprompt's agent).
    const msgId = run('observatorio-ia', 'obs-sender', ['send-message', 'developer', 'normal', 'push R13 please']);
    expect(msgId).toMatch(/^\d+-obs-sender-/);

    // developer (unikprompt) checks inbox with the guard on -> nothing delivered.
    const delivered = JSON.parse(run('unikprompt', 'developer', ['check-inbox']));
    expect(delivered).toEqual([]);
    // The message is in the quarantine dir, not the inbox.
    expect(readdirSync(inboxQuarantineDir('developer')).filter(f => f.endsWith('.json'))).toHaveLength(1);
    expect(existsSync(inboxDir('developer')) ? readdirSync(inboxDir('developer')).filter(f => f.endsWith('.json')) : []).toHaveLength(0);

    // list-quarantine shows it with the stamped sender org.
    const q = JSON.parse(run('unikprompt', 'developer', ['list-quarantine']));
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe(msgId);
    expect(q[0].org).toBe('observatorio-ia');

    // release it back to the inbox.
    const released = run('unikprompt', 'developer', ['release-quarantine', msgId]);
    expect(released).toMatch(/Released/);
    expect(readdirSync(inboxQuarantineDir('developer')).filter(f => f.endsWith('.json'))).toHaveLength(0);
    expect(readdirSync(inboxDir('developer')).filter(f => f.endsWith('.json'))).toHaveLength(1);
  });

  it('default (no guard config = mark): a cross-org message is delivered as before', () => {
    ctxOrgFile('unikprompt'); // no guard block -> mode defaults to 'mark'
    ctxOrgFile('observatorio-ia');

    const msgId = run('observatorio-ia', 'obs-sender', ['send-message', 'developer', 'normal', 'hello']);
    const delivered = JSON.parse(run('unikprompt', 'developer', ['check-inbox']));
    expect(delivered).toHaveLength(1);
    expect(delivered[0].id).toBe(msgId);
    expect(delivered[0].org).toBe('observatorio-ia'); // stamped, but delivered (marked)
    expect(existsSync(inboxQuarantineDir('developer'))).toBe(false);
  });
});
