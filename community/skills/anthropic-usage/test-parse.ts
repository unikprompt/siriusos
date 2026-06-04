#!/usr/bin/env tsx
/**
 * test-parse.ts — smoke unit del parseResponse del usage-fetch.
 * Sin runner de tests para no agregar devDep al repo siriusos.
 * Ejecutar: `npx tsx test-parse.ts` — debe imprimir "all good" y exit 0.
 */

import { parseResponse } from './usage-fetch.js';

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    process.stderr.write(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}\n`);
    process.exit(1);
  }
  process.stdout.write(`  ok ${label}\n`);
}

// Fixture típico del endpoint
const fetchedAt = '2026-06-04T16:00:00.000Z';
const fixture = {
  five_hour: { utilization_pct: 17, reset_at: '2026-06-04T18:30:00Z' },
  seven_day: { utilization_pct: 7, reset_at: '2026-06-09T00:00:00Z' },
  seven_day_opus: { utilization_pct: 12, reset_at: '2026-06-09T00:00:00Z' },
};

const out = parseResponse(fixture, fetchedAt);

assertEq(out.status, 'ok', 'status');
assertEq(out.session_pct, 17, 'session_pct');
assertEq(out.weekly_pct, 7, 'weekly_pct');
assertEq(out.weekly_pct_opus, 12, 'weekly_pct_opus');
assertEq(out.session_resets_at_utc, '2026-06-04T18:30:00Z', 'session_resets_at_utc');
assertEq(out.weekly_resets_at_utc, '2026-06-09T00:00:00Z', 'weekly_resets_at_utc');
assertEq(out.session_resets_in_min, 150, 'session_resets_in_min (16:00 → 18:30 = 150min)');
assertEq(out.fetched_at, fetchedAt, 'fetched_at');
// weekly_resets_day depende del locale; 2026-06-09 es lunes en ET
assertEq(
  out.weekly_resets_day,
  'lunes',
  'weekly_resets_day (2026-06-09 = lunes en es-ES)',
);

// Fixture con campos faltantes (la API podría omitirlos para usuarios sin Opus)
const fixturePartial = {
  five_hour: { utilization_pct: 80, reset_at: '2026-06-04T18:30:00Z' },
  seven_day: { utilization_pct: 50, reset_at: '2026-06-09T00:00:00Z' },
};
const outPartial = parseResponse(fixturePartial, fetchedAt);
assertEq(outPartial.weekly_pct_opus, null, 'weekly_pct_opus null cuando seven_day_opus ausente');
assertEq(outPartial.session_pct, 80, 'session_pct con fixture partial');

// Fixture con reset_at en el pasado (puede pasar entre cron y fetch)
const fetchedAtFuture = '2026-06-05T00:00:00.000Z';
const outPast = parseResponse(fixture, fetchedAtFuture);
assertEq(outPast.session_resets_in_min, 0, 'session_resets_in_min clamped a 0 cuando reset ya pasó');

process.stdout.write('all good\n');
process.exit(0);
