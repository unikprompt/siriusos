import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// The watchdog is a standalone bash script (it must survive the daemon and the
// agent being dead), so we test it as a black box: run it in dry-run with
// injected fixtures and a frozen "now", and assert its decision from stdout.
const SCRIPT = join(process.cwd(), 'scripts/self-healing/orq-silence-watchdog.sh');

const HB_ISO = '2026-01-01T00:00:00Z';
const HB_EPOCH = Math.floor(Date.parse(HB_ISO) / 1000);
const H = 3600;

let dir: string;
let hbFile: string;
let stateFile: string;
let logFile: string;
let userStopFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orq-wd-'));
  hbFile = join(dir, 'heartbeat.json');
  stateFile = join(dir, 'state');
  logFile = join(dir, 'wd.log');
  userStopFile = join(dir, '.user-stop'); // created only in the legit-silence test
  writeFileSync(hbFile, JSON.stringify({ agent: 'orquestador', last_heartbeat: HB_ISO }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(nowEpoch: number, extra: Record<string, string> = {}): string {
  return execFileSync('bash', [SCRIPT], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ORQ_WATCHDOG_DRY_RUN: '1',
      ORQ_WATCHDOG_STALE_HOURS: '9',
      ORQ_WATCHDOG_REALERT_HOURS: '4',
      ORQ_WATCHDOG_USERSTOP_CEILING_HOURS: '24',
      ORQ_WATCHDOG_HEARTBEAT_FILE: hbFile,
      ORQ_WATCHDOG_STATE_FILE: stateFile,
      ORQ_WATCHDOG_LOG_FILE: logFile,
      ORQ_WATCHDOG_USER_STOP_FILE: userStopFile,
      ORQ_WATCHDOG_NOW_EPOCH: String(nowEpoch),
      ...extra,
    },
  });
}

describe('orq-silence-watchdog', () => {
  it('fresh heartbeat (1h old, under 9h): OK, no alarm', () => {
    const out = run(HB_EPOCH + 1 * H);
    expect(out).toMatch(/\bOK:/);
    expect(out).not.toMatch(/ALARM/);
    expect(out).not.toMatch(/would send/);
  });

  it('one missed cycle (8h old, still under 9h): OK, no alarm — no false positive', () => {
    const out = run(HB_EPOCH + 8 * H);
    expect(out).toMatch(/\bOK:/);
    expect(out).not.toMatch(/ALARM/);
  });

  it('silence beyond threshold (10h old, over 9h): ALARM + dry-run alert', () => {
    const out = run(HB_EPOCH + 10 * H);
    expect(out).toMatch(/ALARM/);
    expect(out).toMatch(/DRY-RUN: would send/);
    expect(out).toMatch(/orquestador/);
    expect(out).toMatch(/10h/);
  });

  it('intentional silence (.user-stop, under the 24h ceiling): SKIP, no alarm', () => {
    writeFileSync(userStopFile, 'stopped via siriusos stop');
    const out = run(HB_EPOCH + 10 * H); // stopped, but only 10h — normal intentional stop
    expect(out).toMatch(/SKIP:.*user-stop/);
    expect(out).not.toMatch(/ALARM/);
    expect(out).not.toMatch(/would send/);
  });

  it('.user-stop past the 24h ceiling: ALARM as a question (orphaned vs intentional)', () => {
    // An orphaned .user-stop during a real outage is documented behavior in this
    // system; past the ceiling we must not stay silent — we ask.
    writeFileSync(userStopFile, 'stopped via siriusos stop');
    const out = run(HB_EPOCH + 30 * H); // 30h > 24h ceiling
    expect(out).toMatch(/ALARM/);
    expect(out).toMatch(/DRY-RUN: would send/);
    expect(out).toMatch(/marcador huérfano/);
    expect(out).toMatch(/30h/);
  });

  it('re-alert throttle: second run inside the cooldown does not re-send', () => {
    // First run at 10h stale -> alarms and records the alert time in STATE_FILE.
    const first = run(HB_EPOCH + 10 * H);
    expect(first).toMatch(/ALARM/);
    expect(existsSync(stateFile)).toBe(true);
    // Second run 1h later (still stale, within the 4h cooldown) -> no re-send.
    const second = run(HB_EPOCH + 11 * H);
    expect(second).toMatch(/within re-alert cooldown/);
    expect(second).not.toMatch(/DRY-RUN: would send/);
  });
});
