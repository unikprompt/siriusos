import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { detect, type Suggestion } from '../utils/skill-suggestion-detector.js';
import {
  loadStore,
  saveStore,
  mergeSuggestions,
  listSuggestions,
  defaultCtxRoot,
  type StoredSuggestion,
  type SuggestionStatus,
} from '../utils/skill-suggestion-store.js';
import { validateAgentName, validateInstanceId } from '../utils/validate.js';

interface BaseOpts {
  instance: string;
  agent: string;
  format: 'json' | 'text';
}

interface DetectOpts extends BaseOpts {
  org?: string;
  windowDays?: string;
  minOccurrences?: string;
}

interface ListOpts extends BaseOpts {
  status?: string;
  since?: string;
  patternType?: string;
}

interface ApproveOpts extends BaseOpts {
  draftDir?: string;
}

interface RejectOpts extends BaseOpts {
  reason?: string;
}

interface NotifyOpts extends BaseOpts {
  since?: string;
}

function emit(format: 'json' | 'text', payload: any): void {
  if (format === 'text') {
    process.stdout.write(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
    process.stdout.write('\n');
  } else {
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
}

function fail(format: 'json' | 'text', code: number, message: string): never {
  if (format === 'text') {
    process.stderr.write(`error: ${message}\n`);
  } else {
    process.stderr.write(JSON.stringify({ ok: false, error: message }) + '\n');
  }
  process.exit(code);
}

function resolveAgent(opts: BaseOpts): string {
  const a = opts.agent || process.env.CTX_AGENT_NAME || '';
  if (!a) throw new Error('--agent is required (or set CTX_AGENT_NAME)');
  validateAgentName(a);
  return a;
}

function resolveInstance(opts: BaseOpts): string {
  const i = opts.instance || process.env.CTX_INSTANCE_ID || 'default';
  validateInstanceId(i);
  return i;
}

function resolveOrg(opts: DetectOpts): string {
  const o = opts.org || process.env.CTX_ORG || '';
  if (!o) throw new Error('--org is required (or set CTX_ORG)');
  return o;
}

function resolveCtxRoot(instance: string): string {
  return defaultCtxRoot(instance);
}

function resolveFrameworkRoot(): string {
  const fwRoot = process.env.CTX_FRAMEWORK_ROOT || process.cwd();
  return fwRoot;
}

function parseSince(spec: string | undefined): Date | undefined {
  if (!spec) return undefined;
  if (spec === 'yesterday') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  const m = /^(\d+)d$/.exec(spec);
  if (m) {
    const days = Number(m[1]);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  const parsed = new Date(spec);
  if (!isNaN(parsed.getTime())) return parsed;
  return undefined;
}

function addBaseOptions<T extends Command>(cmd: T): T {
  return cmd
    .option('--instance <id>', 'Instance ID', process.env.CTX_INSTANCE_ID || 'default')
    .option('--agent <name>', 'Agent name', process.env.CTX_AGENT_NAME)
    .option('--format <fmt>', 'Output format: json|text', 'json') as T;
}

export const skillSuggestionsCommand = new Command('skill-suggestions').description(
  'Detect, review, and approve skill suggestions inferred from agent behavior',
);

addBaseOptions(
  skillSuggestionsCommand
    .command('detect')
    .option('--org <org>', 'Org name (defaults to CTX_ORG env)')
    .option('--window-days <n>', 'Lookback window in days', '7')
    .option('--min-occurrences <n>', 'Minimum occurrences to flag', '3')
    .description('Run detector and merge new suggestions into the store'),
).action((opts: DetectOpts) => {
  try {
    const agent = resolveAgent(opts);
    const instance = resolveInstance(opts);
    const org = resolveOrg(opts);
    const ctxRoot = resolveCtxRoot(instance);
    const frameworkRoot = resolveFrameworkRoot();
    const fresh = detect({
      agent,
      org,
      ctxRoot,
      frameworkRoot,
      windowDays: Number(opts.windowDays ?? '7'),
      minOccurrences: Number(opts.minOccurrences ?? '3'),
    });
    const store = loadStore(ctxRoot, agent);
    const result = mergeSuggestions(store, fresh);
    saveStore(ctxRoot, store);
    emit(opts.format, {
      ok: true,
      detected: fresh.length,
      added: result.added,
      updated: result.updated,
      suppressed: result.suppressed,
    });
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  skillSuggestionsCommand
    .command('list')
    .option('--status <s>', 'Filter by status: pending|approved|rejected|notified|all', 'pending')
    .option('--since <spec>', 'Only show suggestions updated since (Nd, ISO date, or "yesterday")')
    .option('--pattern-type <t>', 'Filter by pattern type')
    .description('List suggestions in the store'),
).action((opts: ListOpts) => {
  try {
    const agent = resolveAgent(opts);
    const instance = resolveInstance(opts);
    const ctxRoot = resolveCtxRoot(instance);
    const store = loadStore(ctxRoot, agent);
    const items = listSuggestions(store, {
      status: opts.status as SuggestionStatus | 'all' | undefined,
      since: parseSince(opts.since),
      patternType: opts.patternType,
    });
    if (opts.format === 'text') {
      if (items.length === 0) {
        emit('text', '(no suggestions)');
        return;
      }
      const lines = items.map(
        (s) =>
          `${s.id}  [${s.status}]  ${s.pattern_type}  x${s.occurrences}  ${s.pattern_key}`,
      );
      emit('text', lines.join('\n'));
    } else {
      emit('json', { ok: true, count: items.length, suggestions: items });
    }
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  skillSuggestionsCommand
    .command('show')
    .argument('<id>', 'Suggestion ID')
    .description('Show full detail of a suggestion'),
).action((id: string, opts: BaseOpts) => {
  try {
    const agent = resolveAgent(opts);
    const instance = resolveInstance(opts);
    const ctxRoot = resolveCtxRoot(instance);
    const store = loadStore(ctxRoot, agent);
    const s = store.suggestions[id];
    if (!s) fail(opts.format, 1, `suggestion not found: ${id}`);
    if (opts.format === 'text') {
      const lines = [
        `id: ${s.id}`,
        `agent: ${s.agent}`,
        `pattern_type: ${s.pattern_type}`,
        `pattern_key: ${s.pattern_key}`,
        `status: ${s.status}`,
        `occurrences: ${s.occurrences}`,
        `first_seen: ${s.first_seen}`,
        `last_seen: ${s.last_seen}`,
        `summary: ${s.source_summary}`,
        '',
        'evidence:',
        ...s.evidence.map(
          (e, i) => `  [${i + 1}] (${e.source}) ${e.timestamp}: ${e.excerpt}`,
        ),
      ];
      if (s.draft_path) lines.push('', `draft_path: ${s.draft_path}`);
      if (s.rejected_reason) lines.push('', `rejected_reason: ${s.rejected_reason}`);
      emit('text', lines.join('\n'));
    } else {
      emit('json', { ok: true, suggestion: s });
    }
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

function generateDraftSkill(s: StoredSuggestion): string {
  const slug = s.pattern_key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || s.id.slice(0, 12);
  const title = `Draft: ${s.pattern_type} — ${s.pattern_key}`;
  const evidenceLines = s.evidence
    .map((e, i) => `${i + 1}. (${e.source}) ${e.timestamp} — ${e.excerpt}`)
    .join('\n');
  return `---
name: draft-${slug}
description: Auto-generated draft from skill suggestion ${s.id}. Review and refine before promoting to community/skills/.
status: draft
suggestion_id: ${s.id}
pattern_type: ${s.pattern_type}
created: ${new Date().toISOString()}
---

# ${title}

## Detected pattern

${s.source_summary}

- Occurrences: ${s.occurrences}
- First seen: ${s.first_seen}
- Last seen: ${s.last_seen}
- Pattern key: \`${s.pattern_key}\`

## Evidence

${evidenceLines}

## Suggested skill body (TODO)

> This draft is a starting point. The agent should:
> - Decide whether the pattern warrants a skill, a CLAUDE.md note, or no action.
> - Replace this section with concrete instructions, commands, or guardrails.
> - Move the file to \`community/skills/<slug>/SKILL.md\` (or framework-specific path) when ready.

## Notes

- Approved on: ${new Date().toISOString()}
- Suggestion source: skill-suggestion-detector
`;
}

addBaseOptions(
  skillSuggestionsCommand
    .command('approve')
    .argument('<id>', 'Suggestion ID')
    .option('--draft-dir <path>', 'Override default draft directory')
    .description('Mark approved and write a DRAFT SKILL.md (NOT auto-loaded)'),
).action((id: string, opts: ApproveOpts) => {
  try {
    const agent = resolveAgent(opts);
    const instance = resolveInstance(opts);
    const ctxRoot = resolveCtxRoot(instance);
    const store = loadStore(ctxRoot, agent);
    const s = store.suggestions[id];
    if (!s) fail(opts.format, 1, `suggestion not found: ${id}`);
    const draftRoot = opts.draftDir || join(ctxRoot, 'state', agent, 'skill-drafts');
    const draftDir = join(draftRoot, id);
    mkdirSync(draftDir, { recursive: true });
    const skillPath = join(draftDir, 'SKILL.md');
    writeFileSync(skillPath, generateDraftSkill(s), { encoding: 'utf-8', mode: 0o600 });
    s.status = 'approved';
    s.approved_at = new Date().toISOString();
    s.updated_at = s.approved_at;
    s.draft_path = skillPath;
    saveStore(ctxRoot, store);
    emit(opts.format, { ok: true, id, status: 'approved', draft_path: skillPath });
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  skillSuggestionsCommand
    .command('reject')
    .argument('<id>', 'Suggestion ID')
    .option('--reason <text>', 'Why rejected (optional)')
    .description('Mark rejected (suppresses redetection for 30 days)'),
).action((id: string, opts: RejectOpts) => {
  try {
    const agent = resolveAgent(opts);
    const instance = resolveInstance(opts);
    const ctxRoot = resolveCtxRoot(instance);
    const store = loadStore(ctxRoot, agent);
    const s = store.suggestions[id];
    if (!s) fail(opts.format, 1, `suggestion not found: ${id}`);
    s.status = 'rejected';
    s.rejected_at = new Date().toISOString();
    s.rejected_reason = opts.reason || '';
    s.updated_at = s.rejected_at;
    saveStore(ctxRoot, store);
    emit(opts.format, { ok: true, id, status: 'rejected' });
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  skillSuggestionsCommand
    .command('notify')
    .option('--since <spec>', 'Window for items to include (Nd, ISO, or "yesterday")', 'yesterday')
    .description('Print pending suggestions formatted for a daily notification'),
).action((opts: NotifyOpts) => {
  try {
    const agent = resolveAgent(opts);
    const instance = resolveInstance(opts);
    const ctxRoot = resolveCtxRoot(instance);
    const store = loadStore(ctxRoot, agent);
    const items = listSuggestions(store, {
      status: 'pending',
      since: parseSince(opts.since),
    });
    const now = new Date().toISOString();
    for (const item of items) {
      item.notified_at = now;
      item.status = 'notified';
      item.updated_at = now;
    }
    if (items.length > 0) saveStore(ctxRoot, store);
    if (opts.format === 'text') {
      if (items.length === 0) {
        emit('text', `Skill suggestions for ${agent}: none new since ${opts.since}.`);
        return;
      }
      const lines = [
        `Skill suggestions for ${agent} (${items.length} new since ${opts.since}):`,
        ...items.map(
          (s) =>
            `  • [${s.pattern_type}] ${s.pattern_key} (x${s.occurrences})\n    review: cortextos bus skill-suggestions show ${s.id} --agent ${agent}`,
        ),
      ];
      emit('text', lines.join('\n'));
    } else {
      emit('json', { ok: true, agent, count: items.length, suggestions: items });
    }
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});
