/**
 * shell-explainer.ts — produce a human-readable summary of a shell command.
 *
 * Used by `bus create-approval --command <...>` to enrich the Telegram payload
 * so the operator sees what a command does without parsing it mentally.
 *
 * Design constraints
 * ------------------
 * - **No external dependencies.** A native tree-sitter-bash parser is the
 *   "ideal" tool but adds a node-gyp compile step that breaks portability.
 *   This is a hand-rolled tokenizer + segment splitter + per-program
 *   explainer table that covers ~90% of real-world approval commands
 *   (single binary or a short pipeline of common Unix tools).
 * - **Assistive, not authoritative.** The full raw command is always shown
 *   alongside the explanation. The explainer never executes anything.
 * - **Falls through on complex input.** Heredocs, eval, deeply nested
 *   subshells, and unknown programs degrade to a generic "run X" line so
 *   the operator at least sees the program name without a crash.
 *
 * Public API: only `explainShellCommand` and the `ShellExplanation` type.
 * Internals are exported for tests but should not be used elsewhere.
 */

export type DangerSeverity = 'warn' | 'critical';

export interface DangerFlag {
  /** Stable id for downstream matching/dedup, e.g. "rm-rf-root". */
  code: string;
  /** Operator-friendly one-line warning, e.g. "Recursive force-delete of /". */
  message: string;
  severity: DangerSeverity;
}

export interface ShellExplanation {
  /** The original command, verbatim. */
  command: string;
  /**
   * Multi-line human summary, e.g.
   *   "1. Recursively delete /tmp/build-cache (force)\n
   *    2. Then create archive backup.tar.gz from src/"
   * Empty string only if `command` is empty/whitespace.
   */
  explanation: string;
  /** Zero or more flagged risks. Order: critical first, then warn, then by code. */
  danger_flags: DangerFlag[];
  /**
   * True if the parser couldn't make sense of the command (heredoc, eval'd
   * input, unbalanced quotes). The explanation field will fall back to
   * "Complex command — see raw command above" when this is set.
   */
  fallback: boolean;
}

// ---------------------------------------------------------------------------
// Tokenizer — splits a command into shell tokens while respecting quotes.
// ---------------------------------------------------------------------------

interface Token {
  /** Concatenated text of the token with quote characters stripped. */
  value: string;
  /** Original substring including quotes — used for danger pattern matches. */
  raw: string;
  /** Whether the token contains an unquoted operator like && | ; > etc. */
  isOperator: boolean;
}

/**
 * Tokenize a shell command. This is intentionally permissive: it recognizes
 * single-quote (literal), double-quote (interpolated), and backslash escape,
 * and splits on whitespace + the operators &&, ||, |, ;, &, >, >>, <, 2>&1.
 *
 * Returns null if the input has unbalanced quotes — caller should treat
 * the command as un-parseable.
 */
export function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];

    // Skip whitespace
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    // Operators (longest match first)
    const opMatches = ['&&', '||', '2>&1', '>>', '<<', '|', ';', '&', '>', '<'];
    let matchedOp: string | null = null;
    for (const op of opMatches) {
      if (input.startsWith(op, i)) {
        matchedOp = op;
        break;
      }
    }
    if (matchedOp !== null) {
      tokens.push({ value: matchedOp, raw: matchedOp, isOperator: true });
      i += matchedOp.length;
      continue;
    }

    // Word: read until whitespace or operator, respecting quotes/escapes
    let value = '';
    let raw = '';
    while (i < n) {
      const ch = input[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;

      // Check operator at this position
      let isOpHere = false;
      for (const op of opMatches) {
        if (input.startsWith(op, i)) {
          isOpHere = true;
          break;
        }
      }
      if (isOpHere) break;

      if (ch === '\\' && i + 1 < n) {
        // Escape sequence: take next char literally
        value += input[i + 1];
        raw += ch + input[i + 1];
        i += 2;
        continue;
      }

      if (ch === '\'') {
        // Single-quoted: literal until matching '
        const close = input.indexOf('\'', i + 1);
        if (close === -1) return null; // unbalanced
        value += input.slice(i + 1, close);
        raw += input.slice(i, close + 1);
        i = close + 1;
        continue;
      }

      if (ch === '"') {
        // Double-quoted: scan until matching ", honoring backslash escapes
        let j = i + 1;
        let inner = '';
        let innerRaw = ch;
        while (j < n && input[j] !== '"') {
          if (input[j] === '\\' && j + 1 < n) {
            inner += input[j + 1];
            innerRaw += input[j] + input[j + 1];
            j += 2;
          } else {
            inner += input[j];
            innerRaw += input[j];
            j++;
          }
        }
        if (j >= n) return null; // unbalanced
        innerRaw += '"';
        value += inner;
        raw += innerRaw;
        i = j + 1;
        continue;
      }

      // Regular char
      value += ch;
      raw += ch;
      i++;
    }

    if (value.length > 0 || raw.length > 0) {
      tokens.push({ value, raw, isOperator: false });
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Segment splitter — group tokens between top-level operators.
// ---------------------------------------------------------------------------

export type Connector = '&&' | '||' | ';' | '|' | '&';

export interface Segment {
  /** Word tokens (operators excluded) for this command segment. */
  tokens: Token[];
  /** Connector to the NEXT segment, or null for the final segment. */
  next: Connector | null;
  /** Raw substring this segment covers (concatenation of token.raw with spaces). */
  raw: string;
}

/**
 * Group tokens into command segments, splitting on connectors.
 * Redirect operators (>, >>, <, 2>&1) stay inside the segment they belong to.
 */
export function splitSegments(tokens: Token[]): Segment[] {
  const segments: Segment[] = [];
  let current: Token[] = [];

  const flush = (next: Connector | null) => {
    if (current.length === 0 && next === null) return;
    segments.push({
      tokens: current,
      next,
      raw: current.map(t => t.raw).join(' '),
    });
    current = [];
  };

  for (const t of tokens) {
    if (t.isOperator && (t.value === '&&' || t.value === '||' || t.value === ';' || t.value === '|' || t.value === '&')) {
      flush(t.value as Connector);
    } else {
      current.push(t);
    }
  }
  flush(null);

  return segments;
}

// ---------------------------------------------------------------------------
// Per-program explainers
// ---------------------------------------------------------------------------

interface ProgramExplainer {
  /** Returns a short phrase like "Delete file foo (force)" for this segment. */
  (segment: Segment, words: string[]): string;
}

/** Strip leading flags from words and return positional args. */
function positionalArgs(words: string[]): string[] {
  return words.slice(1).filter(w => !w.startsWith('-'));
}

/** Collect short flags as a set ('rf' from '-rf' contributes 'r' and 'f'). */
function collectFlags(words: string[]): Set<string> {
  const flags = new Set<string>();
  for (const w of words.slice(1)) {
    if (!w.startsWith('-') || w === '-') continue;
    if (w.startsWith('--')) {
      flags.add(w.slice(2).split('=')[0]);
    } else {
      // -rf → r, f ; -1 → 1 ; treat each char as a short flag
      for (const ch of w.slice(1)) flags.add(ch);
    }
  }
  return flags;
}

function joinPaths(args: string[]): string {
  if (args.length === 0) return '<no path>';
  if (args.length === 1) return args[0];
  if (args.length <= 3) return args.join(', ');
  return `${args.slice(0, 2).join(', ')}, +${args.length - 2} more`;
}

const EXPLAINERS: Record<string, ProgramExplainer> = {
  rm: (_s, words) => {
    const flags = collectFlags(words);
    const recursive = flags.has('r') || flags.has('R') || flags.has('recursive');
    const force = flags.has('f') || flags.has('force');
    const args = positionalArgs(words);
    const target = joinPaths(args);
    const mods: string[] = [];
    if (recursive) mods.push('recursively');
    if (force) mods.push('force');
    const modStr = mods.length ? ` (${mods.join(', ')})` : '';
    return `Delete ${target}${modStr}`;
  },
  cp: (_s, words) => {
    const args = positionalArgs(words);
    if (args.length < 2) return `Copy ${joinPaths(args)}`;
    const src = args.slice(0, -1).join(', ');
    const dst = args[args.length - 1];
    const flags = collectFlags(words);
    const r = flags.has('r') || flags.has('R') ? ' recursively' : '';
    return `Copy${r} ${src} → ${dst}`;
  },
  mv: (_s, words) => {
    const args = positionalArgs(words);
    if (args.length < 2) return `Move ${joinPaths(args)}`;
    return `Move ${args.slice(0, -1).join(', ')} → ${args[args.length - 1]}`;
  },
  mkdir: (_s, words) => {
    const flags = collectFlags(words);
    const p = flags.has('p') || flags.has('parents') ? ' (with parents)' : '';
    return `Create directory ${joinPaths(positionalArgs(words))}${p}`;
  },
  rmdir: (_s, words) => `Remove directory ${joinPaths(positionalArgs(words))}`,
  touch: (_s, words) => `Touch ${joinPaths(positionalArgs(words))}`,
  ls: (_s, words) => `List ${joinPaths(positionalArgs(words)) || 'current dir'}`,
  cat: (_s, words) => `Print contents of ${joinPaths(positionalArgs(words))}`,
  head: (_s, words) => `Print first lines of ${joinPaths(positionalArgs(words))}`,
  tail: (_s, words) => `Print last lines of ${joinPaths(positionalArgs(words))}`,
  echo: (_s, words) => `Print: ${words.slice(1).join(' ').slice(0, 80)}`,
  grep: (_s, words) => {
    const args = positionalArgs(words);
    const pat = args[0] ?? '<pattern>';
    const where = args.slice(1);
    return `Search for "${pat}" in ${where.length ? joinPaths(where) : 'stdin'}`;
  },
  sed: (_s, words) => `Run sed: ${words.slice(1).join(' ').slice(0, 80)}`,
  awk: (_s, words) => `Run awk: ${words.slice(1).join(' ').slice(0, 80)}`,
  find: (_s, words) => {
    const args = positionalArgs(words);
    return `Find files under ${args[0] ?? '.'}${words.includes('-delete') ? ' (and delete matches)' : ''}${words.includes('-exec') ? ' (and exec on each)' : ''}`;
  },
  curl: (_s, words) => {
    const args = positionalArgs(words);
    const url = args.find(a => a.startsWith('http')) ?? args[args.length - 1] ?? '<url>';
    const flags = collectFlags(words);
    const method = words.includes('-X') ? words[words.indexOf('-X') + 1] : flags.has('d') || flags.has('data') || flags.has('F') ? 'POST' : 'GET';
    return `HTTP ${method} ${url}`;
  },
  wget: (_s, words) => {
    const args = positionalArgs(words);
    const url = args.find(a => a.startsWith('http')) ?? args[0] ?? '<url>';
    return `Download ${url}`;
  },
  tar: (_s, words) => {
    const flags = collectFlags(words);
    // BSD-style: `tar czf foo.tgz src/` — first non-flag arg is a flag bundle (no dash)
    let bsdFlagBundle = '';
    if (words.length > 1 && /^[a-zA-Z]+$/.test(words[1]) && /[cxtruf]/.test(words[1])) {
      bsdFlagBundle = words[1];
      for (const ch of bsdFlagBundle) flags.add(ch);
    }
    const create = flags.has('c');
    const extract = flags.has('x');
    const args = bsdFlagBundle ? words.slice(2).filter(w => !w.startsWith('-')) : positionalArgs(words);
    const fileIdx = words.findIndex(w => w === '-f' || w === '--file');
    const archive = fileIdx >= 0 ? words[fileIdx + 1] : (bsdFlagBundle.includes('f') ? args[0] : args[0]);
    if (create) return `Create archive ${archive ?? ''}`;
    if (extract) return `Extract archive ${archive ?? ''}`;
    return `Run tar on ${archive ?? '<archive>'}`;
  },
  zip: (_s, words) => `Create zip ${positionalArgs(words)[0] ?? ''}`,
  unzip: (_s, words) => `Extract zip ${positionalArgs(words)[0] ?? ''}`,
  gzip: (_s, words) => `Gzip ${joinPaths(positionalArgs(words))}`,
  gunzip: (_s, words) => `Gunzip ${joinPaths(positionalArgs(words))}`,
  ssh: (_s, words) => `SSH to ${positionalArgs(words)[0] ?? '<host>'}`,
  scp: (_s, words) => {
    const args = positionalArgs(words);
    return `Secure copy ${args.slice(0, -1).join(', ')} → ${args[args.length - 1] ?? ''}`;
  },
  rsync: (_s, words) => {
    const args = positionalArgs(words);
    return `Rsync ${args.slice(0, -1).join(', ')} → ${args[args.length - 1] ?? ''}`;
  },
  git: (_s, words) => {
    const sub = words[1] ?? '';
    const rest = words.slice(2).join(' ').slice(0, 60);
    return `git ${sub}${rest ? ` ${rest}` : ''}`;
  },
  npm: (_s, words) => `npm ${words.slice(1).join(' ').slice(0, 80)}`,
  npx: (_s, words) => `npx ${words.slice(1).join(' ').slice(0, 80)}`,
  yarn: (_s, words) => `yarn ${words.slice(1).join(' ').slice(0, 80)}`,
  pnpm: (_s, words) => `pnpm ${words.slice(1).join(' ').slice(0, 80)}`,
  node: (_s, words) => `Run node ${positionalArgs(words)[0] ?? ''}`,
  python: (_s, words) => `Run python ${positionalArgs(words)[0] ?? ''}`,
  python3: (_s, words) => `Run python3 ${positionalArgs(words)[0] ?? ''}`,
  pip: (_s, words) => `pip ${words.slice(1).join(' ').slice(0, 80)}`,
  pip3: (_s, words) => `pip3 ${words.slice(1).join(' ').slice(0, 80)}`,
  docker: (_s, words) => `docker ${words.slice(1).join(' ').slice(0, 80)}`,
  kubectl: (_s, words) => `kubectl ${words.slice(1).join(' ').slice(0, 80)}`,
  systemctl: (_s, words) => `systemctl ${words.slice(1).join(' ').slice(0, 80)}`,
  launchctl: (_s, words) => `launchctl ${words.slice(1).join(' ').slice(0, 80)}`,
  brew: (_s, words) => `brew ${words.slice(1).join(' ').slice(0, 80)}`,
  apt: (_s, words) => `apt ${words.slice(1).join(' ').slice(0, 80)}`,
  'apt-get': (_s, words) => `apt-get ${words.slice(1).join(' ').slice(0, 80)}`,
  yum: (_s, words) => `yum ${words.slice(1).join(' ').slice(0, 80)}`,
  dnf: (_s, words) => `dnf ${words.slice(1).join(' ').slice(0, 80)}`,
  chmod: (_s, words) => `Change permissions to ${positionalArgs(words)[0] ?? ''} on ${joinPaths(positionalArgs(words).slice(1))}`,
  chown: (_s, words) => `Change ownership to ${positionalArgs(words)[0] ?? ''} on ${joinPaths(positionalArgs(words).slice(1))}`,
  kill: (_s, words) => `Kill process ${positionalArgs(words).join(', ')}`,
  pkill: (_s, words) => `Kill processes matching ${positionalArgs(words)[0] ?? ''}`,
  ps: (_s) => `List processes`,
  lsof: (_s) => `List open files`,
  netstat: (_s) => `Show network status`,
  nc: (_s, words) => `netcat ${words.slice(1).join(' ').slice(0, 80)}`,
  ping: (_s, words) => `Ping ${positionalArgs(words)[0] ?? '<host>'}`,
  dig: (_s, words) => `DNS lookup ${positionalArgs(words)[0] ?? '<name>'}`,
  cd: (_s, words) => `Change directory to ${positionalArgs(words)[0] ?? '~'}`,
  source: (_s, words) => `Source ${positionalArgs(words)[0] ?? ''}`,
  '.': (_s, words) => `Source ${positionalArgs(words)[0] ?? ''}`,
  export: (_s, words) => `Export env: ${words.slice(1).join(' ').slice(0, 80)}`,
  env: (_s, words) => `env ${words.slice(1).join(' ').slice(0, 80)}`,
  sudo: (_s, words) => `[sudo] ${words.slice(1).join(' ').slice(0, 100)}`,
  sh: (_s, words) => `Run shell script ${positionalArgs(words)[0] ?? ''}`,
  bash: (_s, words) => `Run bash script ${positionalArgs(words)[0] ?? ''}`,
  zsh: (_s, words) => `Run zsh script ${positionalArgs(words)[0] ?? ''}`,
  dd: (_s, words) => `dd ${words.slice(1).join(' ').slice(0, 80)}`,
  mkfs: (_s, words) => `Format filesystem ${words.slice(1).join(' ').slice(0, 80)}`,
  eval: (_s, words) => `Evaluate: ${words.slice(1).join(' ').slice(0, 80)}`,
};

/**
 * Lookup explainer by program name. Strips a leading path so `/usr/bin/curl`
 * uses the same explainer as `curl`. Returns a generic "Run X" explainer
 * for unknown programs.
 */
function explainerFor(program: string): ProgramExplainer {
  const base = program.includes('/') ? program.slice(program.lastIndexOf('/') + 1) : program;
  return EXPLAINERS[base] ?? ((_s, words) => `Run ${base}${words.length > 1 ? ' (' + words.slice(1).slice(0, 3).join(' ') + (words.length > 4 ? '…' : '') + ')' : ''}`);
}

// ---------------------------------------------------------------------------
// Connector composition
// ---------------------------------------------------------------------------

const CONNECTOR_PHRASE: Record<Connector, string> = {
  '&&': 'then',
  '||': 'or (on failure)',
  ';': 'then',
  '|': 'piped to',
  '&': '(in background) then',
};

// ---------------------------------------------------------------------------
// Danger detector
// ---------------------------------------------------------------------------

interface DangerRule {
  code: string;
  severity: DangerSeverity;
  message: string;
  /** Returns true if the danger applies to (rawCommand, segments). */
  matches: (raw: string, segments: Segment[]) => boolean;
}

/** Skip `sudo` and any leading FOO=bar env-var assignments to find the real program. */
function effectiveWords(words: string[]): string[] {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w === 'sudo') { i++; continue; }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { i++; continue; }
    break;
  }
  return words.slice(i);
}

/** Shared helper: does any segment look like `rm -rf <root-ish>`? */
function isRmRfRoot(segments: Segment[]): { hit: boolean; target?: string } {
  for (const seg of segments) {
    const words = effectiveWords(seg.tokens.map(t => t.value));
    if (words[0] !== 'rm') continue;
    const flags = collectFlags(words);
    if (!(flags.has('r') || flags.has('R') || flags.has('recursive'))) continue;
    if (!(flags.has('f') || flags.has('force'))) continue;
    for (const arg of positionalArgs(words)) {
      // Match "/", "/*", "/etc", "/usr", "/var", "/home", "/Users", "$HOME", "~", "~/"
      if (arg === '/' || arg === '/*' || arg === '~' || arg === '~/' || arg === '$HOME' || arg === '${HOME}') {
        return { hit: true, target: arg };
      }
      if (/^\/(etc|usr|var|home|Users|Library|System|bin|sbin|opt|root|boot)(\/|$)/.test(arg)) {
        return { hit: true, target: arg };
      }
    }
  }
  return { hit: false };
}

const DANGER_RULES: DangerRule[] = [
  {
    code: 'rm-rf-root',
    severity: 'critical',
    message: '',
    matches: (_raw, segs) => isRmRfRoot(segs).hit,
  },
  {
    code: 'curl-pipe-shell',
    severity: 'critical',
    message: 'Network download piped directly to a shell interpreter (curl|sh / wget|sh).',
    matches: (_raw, segs) => {
      for (let i = 0; i < segs.length - 1; i++) {
        const cur = segs[i];
        const next = segs[i + 1];
        if (cur.next !== '|') continue;
        const curProg = cur.tokens[0]?.value;
        const nextProg = next.tokens[0]?.value;
        if ((curProg === 'curl' || curProg === 'wget') && (nextProg === 'sh' || nextProg === 'bash' || nextProg === 'zsh')) {
          return true;
        }
      }
      return false;
    },
  },
  {
    code: 'dd-raw-device',
    severity: 'critical',
    message: 'dd writing to a raw block device (/dev/sd*, /dev/disk*, /dev/nvme*).',
    matches: (_raw, segs) => segs.some(s => {
      const words = s.tokens.map(t => t.value);
      if (words[0] !== 'dd') return false;
      return words.some(w => /^of=\/dev\/(sd|disk|nvme|hd|mmcblk)/.test(w));
    }),
  },
  {
    code: 'mkfs-format',
    severity: 'critical',
    message: 'Filesystem format operation (mkfs.*) — destroys all data on target.',
    matches: (_raw, segs) => segs.some(s => /^mkfs(\.|$)/.test(s.tokens[0]?.value ?? '')),
  },
  {
    code: 'forkbomb',
    severity: 'critical',
    message: 'Fork bomb pattern detected (`:(){ :|:& };:`).',
    matches: raw => /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(raw),
  },
  {
    code: 'sudo-prefix',
    severity: 'warn',
    message: 'Runs with elevated privileges (sudo).',
    matches: (_raw, segs) => segs.some(s => s.tokens[0]?.value === 'sudo'),
  },
  {
    code: 'chmod-777',
    severity: 'warn',
    message: 'World-writable permissions (chmod 777) — usually a security smell.',
    matches: (_raw, segs) => segs.some(s => {
      const words = s.tokens.map(t => t.value);
      if (words[0] !== 'chmod') return false;
      return words.some(w => w === '777' || w === '666' || w === 'a+rwx');
    }),
  },
  {
    code: 'redirect-raw-device',
    severity: 'critical',
    message: 'Output redirected to a raw block device — destroys disk contents.',
    matches: raw => /\s>\s*\/dev\/(sd|disk|nvme|hd|mmcblk)/.test(raw),
  },
  {
    code: 'eval-input',
    severity: 'warn',
    message: 'Uses `eval` — executes a string as code. Verify the input source.',
    matches: (_raw, segs) => segs.some(s => s.tokens[0]?.value === 'eval'),
  },
  {
    code: 'curl-pipe-bash-implicit',
    severity: 'warn',
    message: 'Network output piped to a parser — verify the source URL is trusted.',
    matches: (_raw, segs) => {
      // curl|<anything>: not as severe as |sh, but still worth flagging
      for (let i = 0; i < segs.length - 1; i++) {
        const cur = segs[i];
        if (cur.next !== '|') continue;
        const curProg = cur.tokens[0]?.value;
        const nextProg = segs[i + 1].tokens[0]?.value;
        if ((curProg === 'curl' || curProg === 'wget')
          && nextProg && !['sh', 'bash', 'zsh', 'jq', 'tee', 'cat', 'head', 'tail'].includes(nextProg)) {
          return true;
        }
      }
      return false;
    },
  },
  {
    code: 'inline-secret',
    severity: 'warn',
    message: 'Possible inline secret (password=/token=/api_key=/secret=) in command.',
    matches: raw => /\b(password|token|api[_-]?key|secret|bearer)\s*=\s*[A-Za-z0-9_\-./]+/i.test(raw),
  },
];

function detectDangers(rawCommand: string, segments: Segment[]): DangerFlag[] {
  const flags: DangerFlag[] = [];
  for (const rule of DANGER_RULES) {
    if (!rule.matches(rawCommand, segments)) continue;
    let message = rule.message;
    if (rule.code === 'rm-rf-root') {
      const detail = isRmRfRoot(segments);
      message = `Recursive force-delete targeting ${detail.target ?? 'a system path'}.`;
    }
    flags.push({ code: rule.code, message, severity: rule.severity });
  }
  // Order: critical first, then warn, then by code (stable)
  flags.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return a.code.localeCompare(b.code);
  });
  return flags;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Hard cap on raw command size we'll attempt to parse; longer = fallback. */
const MAX_PARSE_LENGTH = 4096;

export function explainShellCommand(command: string): ShellExplanation {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { command, explanation: '', danger_flags: [], fallback: false };
  }

  // Heredocs and very long commands degrade to fallback explanation but
  // still get a danger pass on the raw text.
  const tooLong = trimmed.length > MAX_PARSE_LENGTH;
  const hasHeredoc = /<<-?\s*['"]?\w+['"]?/.test(trimmed);

  const tokens = tooLong || hasHeredoc ? null : tokenize(trimmed);
  if (tokens === null) {
    const dangers = detectDangers(trimmed, []);
    return {
      command,
      explanation: 'Complex command — see raw command above.',
      danger_flags: dangers,
      fallback: true,
    };
  }

  const segments = splitSegments(tokens);
  if (segments.length === 0) {
    return { command, explanation: '', danger_flags: [], fallback: false };
  }

  const lines: string[] = [];
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    const words = seg.tokens.map(t => t.value);
    if (words.length === 0) continue;

    let program = words[0];
    let segWords = words;
    // Handle env-var prefix like `FOO=bar BAZ=qux cmd args` — find first non-assignment
    while (program.includes('=') && !program.startsWith('=') && segWords.length > 1) {
      segWords = segWords.slice(1);
      program = segWords[0];
    }
    // sudo prefix: explain the wrapped command but flag is added by danger detector
    if (program === 'sudo' && segWords.length > 1) {
      const inner = explainerFor(segWords[1])({ ...seg, tokens: seg.tokens.slice(seg.tokens.indexOf(seg.tokens.find(t => t.value === segWords[1])!)) }, segWords.slice(1));
      lines.push(`${idx + 1}. [sudo] ${inner}`);
    } else {
      const phrase = explainerFor(program)(seg, segWords);
      lines.push(`${idx + 1}. ${phrase}`);
    }

    if (seg.next) {
      const conn = CONNECTOR_PHRASE[seg.next];
      lines[lines.length - 1] += ` — ${conn}`;
    }
  }

  return {
    command,
    explanation: lines.join('\n'),
    danger_flags: detectDangers(trimmed, segments),
    fallback: false,
  };
}

/**
 * Format an explanation for inclusion in the Telegram approval post.
 * Returns the multi-line block ready to append after the raw command.
 *
 * Empty string when there's nothing useful to add (no explanation AND no
 * danger flags) — caller can omit the section entirely.
 */
export function formatExplanationForTelegram(exp: ShellExplanation): string {
  if (!exp.explanation && exp.danger_flags.length === 0) return '';
  const parts: string[] = [];
  if (exp.explanation) {
    parts.push('What it does:');
    parts.push(exp.explanation);
  }
  if (exp.danger_flags.length > 0) {
    parts.push('');
    parts.push('Danger flags:');
    for (const f of exp.danger_flags) {
      const tag = f.severity === 'critical' ? '🚨 CRITICAL' : '⚠️ WARN';
      parts.push(`  ${tag} [${f.code}] ${f.message}`);
    }
  }
  return parts.join('\n');
}
