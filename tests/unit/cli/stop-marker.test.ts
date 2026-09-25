import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeStopMarker, clearStopMarker } from '../../../src/cli/stop.js';

// os.homedir() honors $HOME on POSIX, so redirecting HOME keeps these tests off
// the real ~/.siriusos. Matches the convention in enable-agent-validation.test.ts.
describe('stop.ts .user-stop marker (BUG-036 write / BUG-050 clear)', () => {
  const instance = 'test-instance';
  const agent = 'alice';
  const origHome = process.env.HOME;
  let tmpHome: string;

  const markerPath = () =>
    join(process.env.HOME as string, '.siriusos', instance, 'state', agent, '.user-stop');

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'sos-stopmarker-'));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('writeStopMarker creates the marker with the given reason', () => {
    writeStopMarker(instance, agent, 'stopped via siriusos stop');
    expect(existsSync(markerPath())).toBe(true);
    expect(readFileSync(markerPath(), 'utf-8')).toBe('stopped via siriusos stop');
  });

  it('clearStopMarker removes an existing marker (start/enable path)', () => {
    writeStopMarker(instance, agent, 'stopped via siriusos stop');
    expect(existsSync(markerPath())).toBe(true);

    clearStopMarker(instance, agent);
    expect(existsSync(markerPath())).toBe(false);
  });

  it('clearStopMarker is a safe no-op when the marker is absent', () => {
    expect(existsSync(markerPath())).toBe(false);
    expect(() => clearStopMarker(instance, agent)).not.toThrow();
    expect(existsSync(markerPath())).toBe(false);
  });
});
