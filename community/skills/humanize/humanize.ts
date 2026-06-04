#!/usr/bin/env tsx
/**
 * humanize — detecta y reescribe frases con estructura formulaica de IA.
 *
 * Modos:
 *   scan      : lista findings (default), no modifica el texto. Imprime JSON a stdout.
 *   rewrite   : aplica reemplazos determinísticos. Si el patrón tiene `suggestion`
 *               fija, la usa; sino marca la frase con un comentario inline para
 *               reescritura posterior. Imprime el texto corregido a stdout y los
 *               findings a stderr.
 *
 * Uso:
 *   echo "borrador..." | tsx humanize.ts --mode scan
 *   tsx humanize.ts --mode rewrite --file draft.md > clean.md
 *   tsx humanize.ts --mode scan --patterns custom-patterns.json --file draft.md
 *
 * Exit codes:
 *   0  modo scan: sin findings (texto limpio). modo rewrite: siempre 0 si no hay error.
 *   1  modo scan: hay findings (útil para CI / gates).
 *   2  error de I/O o JSON inválido.
 *
 * Pipeline esperado (de la spec del orquestador):
 *   Content draft → humanize scan → si findings, humanize rewrite → Codex fact-check → publicar
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATTERNS = join(SCRIPT_DIR, 'patterns.json');

// Marcadores que el draft puede usar para excluir un bloque del scan.
const IGNORE_OPEN = '<!-- HUMANIZE-IGNORE -->';
const IGNORE_CLOSE = '<!-- /HUMANIZE-IGNORE -->';

interface Pattern {
  id: string;
  pattern: string;
  flags?: string;
  reason: string;
  suggestion: string | null;
  severity: 'high' | 'medium' | 'low';
  examples_bad?: string[];
}

interface PatternsFile {
  version: number;
  updated?: string;
  language?: string;
  patterns: Pattern[];
  notes?: Record<string, string>;
}

interface Finding {
  pattern_id: string;
  reason: string;
  severity: string;
  matched_text: string;
  line: number;
  column: number;
  start: number;
  end: number;
  suggestion: string | null;
}

interface ScanResult {
  findings: Finding[];
  total: number;
  by_severity: Record<string, number>;
}

interface RewriteResult extends ScanResult {
  text: string;
  changes: number;
}

// ---------- argparse minimalista ----------

interface Args {
  mode: 'scan' | 'rewrite';
  file?: string;
  patternsPath: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'scan', patternsPath: DEFAULT_PATTERNS, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') args.mode = (argv[++i] as 'scan' | 'rewrite') ?? 'scan';
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--patterns') args.patternsPath = argv[++i];
    else if (a === '-h' || a === '--help') args.help = true;
  }
  if (args.mode !== 'scan' && args.mode !== 'rewrite') {
    throw new Error(`mode inválido: '${args.mode}'. Usar scan o rewrite.`);
  }
  return args;
}

function printHelp(): void {
  console.error(`humanize — detecta frases formulaicas de IA en borradores.

Uso:
  echo "texto" | humanize.ts [--mode scan|rewrite] [--patterns FILE]
  humanize.ts --file draft.md [--mode scan|rewrite] [--patterns FILE]

Opciones:
  --mode scan       (default) lista findings JSON a stdout. Exit 1 si hay findings.
  --mode rewrite    devuelve texto corregido en stdout, findings en stderr.
  --file PATH       lee desde archivo en vez de stdin.
  --patterns PATH   usa otra blacklist (default: patterns.json del skill).
  -h, --help        muestra esta ayuda.

Pipeline: Content draft → humanize scan → si findings, humanize rewrite → Codex.
`);
}

// ---------- IO ----------

function readInput(file?: string): string {
  if (file) {
    try {
      return readFileSync(file, 'utf8');
    } catch (e) {
      throw new Error(`no se pudo leer ${file}: ${(e as Error).message}`);
    }
  }
  // stdin
  try {
    return readFileSync(0, 'utf8');
  } catch (e) {
    throw new Error(`no se pudo leer stdin: ${(e as Error).message}`);
  }
}

function loadPatterns(path: string): PatternsFile {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as PatternsFile;
  if (!parsed.patterns || !Array.isArray(parsed.patterns)) {
    throw new Error(`patterns.json inválido: falta array 'patterns'`);
  }
  return parsed;
}

// ---------- ignore-blocks ----------

interface IgnoreRange {
  start: number;
  end: number;
}

function findIgnoreRanges(text: string): IgnoreRange[] {
  const ranges: IgnoreRange[] = [];
  let cursor = 0;
  while (true) {
    const open = text.indexOf(IGNORE_OPEN, cursor);
    if (open < 0) break;
    const close = text.indexOf(IGNORE_CLOSE, open + IGNORE_OPEN.length);
    if (close < 0) break; // tag huérfano, no aplica
    ranges.push({ start: open, end: close + IGNORE_CLOSE.length });
    cursor = close + IGNORE_CLOSE.length;
  }
  return ranges;
}

function isInsideIgnore(pos: number, ranges: IgnoreRange[]): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return true;
  }
  return false;
}

function positionToLineCol(text: string, pos: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: pos - lastNewline };
}

// ---------- scan ----------

export function scan(text: string, patterns: Pattern[]): ScanResult {
  const findings: Finding[] = [];
  const ignoreRanges = findIgnoreRanges(text);

  for (const p of patterns) {
    // El regex debe ser global para iterar matches; si no lo es, lo forzamos.
    const flags = (p.flags ?? 'iu').includes('g') ? p.flags! : (p.flags ?? 'iu') + 'g';
    let re: RegExp;
    try {
      re = new RegExp(p.pattern, flags);
    } catch (e) {
      throw new Error(`patrón inválido '${p.id}': ${(e as Error).message}`);
    }
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index === re.lastIndex) re.lastIndex++; // safety contra match vacío
      if (isInsideIgnore(m.index, ignoreRanges)) continue;
      const { line, column } = positionToLineCol(text, m.index);
      findings.push({
        pattern_id: p.id,
        reason: p.reason,
        severity: p.severity,
        matched_text: m[0],
        line,
        column,
        start: m.index,
        end: m.index + m[0].length,
        suggestion: p.suggestion,
      });
    }
  }

  // Orden por posición (start asc) para output predecible.
  findings.sort((a, b) => a.start - b.start);

  const by_severity: Record<string, number> = {};
  for (const f of findings) {
    by_severity[f.severity] = (by_severity[f.severity] ?? 0) + 1;
  }

  return { findings, total: findings.length, by_severity };
}

// ---------- rewrite ----------

export function rewrite(text: string, patterns: Pattern[]): RewriteResult {
  const scanResult = scan(text, patterns);
  // Aplicamos reemplazos en orden inverso para no invalidar los offsets de
  // los findings posteriores al insertar/eliminar texto.
  let out = text;
  let changes = 0;
  for (let i = scanResult.findings.length - 1; i >= 0; i--) {
    const f = scanResult.findings[i];
    const replacement =
      f.suggestion !== null
        ? f.suggestion
        : `<!-- HUMANIZE[${f.pattern_id}]: ${f.reason} Frase original: "${f.matched_text}" -->`;
    out = out.slice(0, f.start) + replacement + out.slice(f.end);
    changes++;
  }

  return { ...scanResult, text: out, changes };
}

// ---------- main ----------

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`humanize: ${(e as Error).message}\n`);
    printHelp();
    process.exit(2);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let patternsFile: PatternsFile;
  try {
    patternsFile = loadPatterns(args.patternsPath);
  } catch (e) {
    console.error(`humanize: ${(e as Error).message}`);
    process.exit(2);
  }

  let input: string;
  try {
    input = readInput(args.file);
  } catch (e) {
    console.error(`humanize: ${(e as Error).message}`);
    process.exit(2);
  }

  if (args.mode === 'scan') {
    const result = scan(input, patternsFile.patterns);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.total > 0 ? 1 : 0);
  } else {
    const result = rewrite(input, patternsFile.patterns);
    process.stdout.write(result.text);
    process.stderr.write(
      JSON.stringify(
        { findings: result.findings, total: result.total, changes: result.changes, by_severity: result.by_severity },
        null,
        2,
      ) + '\n',
    );
    process.exit(0);
  }
}

const isDirectInvocation =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main();
}
