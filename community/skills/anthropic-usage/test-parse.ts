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

// Fixture del shape REAL del endpoint claude.ai (confirmado vía --debug-raw
// 2026-06-04 por orquestador). Campos: `utilization` (no `utilization_pct`)
// y `resets_at` (no `reset_at`). Incluye seven_day_sonnet por-modelo.
const fetchedAt = '2026-06-04T16:00:00.000Z';
const fixture = {
  five_hour: { utilization: 7, resets_at: '2026-06-04T18:30:00.038758+00:00' },
  seven_day: { utilization: 9, resets_at: '2026-06-09T00:00:00.038776+00:00' },
  seven_day_opus: null,
  seven_day_sonnet: { utilization: 6, resets_at: '2026-06-09T00:00:00.038784+00:00' },
};

const out = parseResponse(fixture, fetchedAt);

assertEq(out.status, 'ok', 'status');
assertEq(out.session_pct, 7, 'session_pct');
assertEq(out.weekly_pct, 9, 'weekly_pct');
assertEq(out.weekly_pct_opus, null, 'weekly_pct_opus null cuando bucket null');
assertEq(out.weekly_pct_sonnet, 6, 'weekly_pct_sonnet');
assertEq(out.session_resets_at_utc, '2026-06-04T18:30:00.038758+00:00', 'session_resets_at_utc');
assertEq(out.weekly_resets_at_utc, '2026-06-09T00:00:00.038776+00:00', 'weekly_resets_at_utc');
assertEq(out.session_resets_in_min, 150, 'session_resets_in_min (16:00 → 18:30 = 150min)');
assertEq(out.fetched_at, fetchedAt, 'fetched_at');
// weekly_resets_day depende del locale; 2026-06-09 es lunes en ET
assertEq(
  out.weekly_resets_day,
  'lunes',
  'weekly_resets_day (2026-06-09 = lunes en es-ES)',
);

// Fixture con campos faltantes (la API puede omitir buckets o devolverlos null)
const fixturePartial = {
  five_hour: { utilization: 80, resets_at: '2026-06-04T18:30:00Z' },
  seven_day: { utilization: 50, resets_at: '2026-06-09T00:00:00Z' },
};
const outPartial = parseResponse(fixturePartial, fetchedAt);
assertEq(outPartial.weekly_pct_opus, null, 'weekly_pct_opus null cuando seven_day_opus ausente');
assertEq(outPartial.weekly_pct_sonnet, null, 'weekly_pct_sonnet null cuando seven_day_sonnet ausente');
assertEq(outPartial.session_pct, 80, 'session_pct con fixture partial');

// Fixture con resets_at en el pasado (puede pasar entre cron y fetch)
const fetchedAtFuture = '2026-06-05T00:00:00.000Z';
const outPast = parseResponse(fixture, fetchedAtFuture);
assertEq(outPast.session_resets_in_min, 0, 'session_resets_in_min clamped a 0 cuando reset ya pasó');

process.stdout.write('all good\n');
process.exit(0);
