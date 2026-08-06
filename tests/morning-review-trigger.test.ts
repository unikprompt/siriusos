// Guards the fix for the orchestrator's "anticipated" morning-review trigger.
// The heartbeat instruction used to read "before 10 AM", which also matches the
// middle of the night (00:00-06:00) — so a night heartbeat could fire the
// morning review at, e.g., 3 AM. The trigger must be bounded to a daytime
// morning window (at or after 6 AM and before 10 AM), never overnight.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..');
const HEARTBEAT_FILES = [
  'templates/orchestrator/HEARTBEAT.md',
  'community/agents/orchestrator/HEARTBEAT.md',
];

describe('orchestrator morning-review anticipated trigger is daytime-bounded', () => {
  for (const rel of HEARTBEAT_FILES) {
    it(`${rel} bounds the anticipated morning-review trigger to a daytime window`, () => {
      const content = readFileSync(join(REPO_ROOT, rel), 'utf-8');
      const line = content.split('\n').find((l) => l.includes('trigger morning review now'));
      expect(line, `anticipated-trigger line missing in ${rel}`).toBeTruthy();
      const l = line as string;
      // Must state an explicit daytime lower bound, not only an upper bound.
      expect(l).toContain('6 AM');
      expect(l.toLowerCase()).toContain('never overnight');
      // Must NOT be the old unbounded form that also fires overnight.
      expect(l).not.toMatch(/is not today AND it is before 10 AM: trigger/);
    });
  }
});
