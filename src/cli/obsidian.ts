import { Command } from 'commander';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { homedir } from 'os';
import { atomicWriteSync } from '../utils/atomic.js';
import { validateAgentName, validateInstanceId } from '../utils/validate.js';
import {
  checkPermission,
  PathEscapeError,
  PermissionError,
  readAgentObsidianConfig,
  resolveVaultPath,
  type ObsidianAgentConfig,
  type ObsidianOp,
} from '../utils/obsidian-permissions.js';
import { acquireFileLock, LockTimeoutError } from '../utils/obsidian-lock.js';

interface ObsidianGlobalConfig {
  vault_path: string;
  vault_name?: string;
  icloud_sync_check?: boolean;
  lock_timeout_ms?: number;
  audit_log?: boolean;
}

interface BaseOptions {
  instance: string;
  agent: string;
  format: 'json' | 'text';
}

interface WriteNoteOptions extends BaseOptions {
  content?: string;
  fromStdin?: boolean;
  frontmatter?: string;
  overwrite?: boolean;
}

interface AppendOptions extends BaseOptions {}

interface AppendDailyOptions extends BaseOptions {
  folder: string;
}

interface ReadNoteOptions extends BaseOptions {
  frontmatterOnly?: boolean;
}

interface SearchByTagOptions extends BaseOptions {
  folder?: string;
}

interface ListNotesOptions extends BaseOptions {
  recursive?: boolean;
}

function loadGlobalConfig(instance: string): ObsidianGlobalConfig {
  const path = join(homedir(), '.cortextos', instance, 'config', 'obsidian.json');
  if (!existsSync(path)) {
    throw new Error(`obsidian.json not found at ${path}. Create it with at least { "vault_path": "..." }.`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed.vault_path !== 'string' || !parsed.vault_path) {
    throw new Error(`obsidian.json missing required field 'vault_path'`);
  }
  if (!existsSync(parsed.vault_path)) {
    throw new Error(`vault_path does not exist: ${parsed.vault_path}`);
  }
  return {
    vault_path: parsed.vault_path,
    vault_name: parsed.vault_name,
    icloud_sync_check: parsed.icloud_sync_check !== false,
    lock_timeout_ms: typeof parsed.lock_timeout_ms === 'number' ? parsed.lock_timeout_ms : 5000,
    audit_log: parsed.audit_log === true,
  };
}

function findAgentConfigPath(agent: string, instance: string): string | null {
  const projectRoot = process.env.CTX_FRAMEWORK_ROOT || process.env.CTX_PROJECT_ROOT || process.cwd();
  const orgsDir = join(projectRoot, 'orgs');
  if (!existsSync(orgsDir)) return null;
  for (const org of readdirSync(orgsDir)) {
    const candidate = join(orgsDir, org, 'agents', agent, 'config.json');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function loadAgentConfig(agent: string, instance: string): ObsidianAgentConfig {
  const path = findAgentConfigPath(agent, instance);
  if (!path) return { scopes: [] };
  return readAgentObsidianConfig(path);
}

function ensurePermission(
  agentConfig: ObsidianAgentConfig,
  relativePath: string,
  op: ObsidianOp,
): void {
  const decision = checkPermission(agentConfig, relativePath, op);
  if (!decision.allowed) {
    throw new PermissionError(decision.reason);
  }
}

function parseFrontmatter(text: string): { frontmatter: Record<string, any> | null; body: string } {
  if (!text.startsWith('---\n')) return { frontmatter: null, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: null, body: text };
  const yaml = text.slice(4, end);
  const body = text.slice(end + 5);
  return { frontmatter: parseYamlSimple(yaml), body };
}

/**
 * Minimal YAML parser supporting the subset Obsidian frontmatter uses:
 * scalars (string/number/bool), inline arrays `[a, b]`, and tag-style lists `tags:\n  - a\n  - b`.
 */
function parseYamlSimple(yaml: string): Record<string, any> {
  const out: Record<string, any> = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i += 1; continue; }
    const colon = line.indexOf(':');
    if (colon === -1) { i += 1; continue; }
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (rest === '') {
      const items: any[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        items.push(scalarFromYaml(lines[j].replace(/^\s+-\s+/, '').trim()));
        j += 1;
      }
      out[key] = items;
      i = j;
      continue;
    }
    if (rest.startsWith('[') && rest.endsWith(']')) {
      out[key] = rest.slice(1, -1).split(',').map((s) => scalarFromYaml(s.trim())).filter((v) => v !== '');
      i += 1;
      continue;
    }
    out[key] = scalarFromYaml(rest);
    i += 1;
  }
  return out;
}

function scalarFromYaml(v: string): any {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function serializeFrontmatter(fm: Record<string, any>): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => serializeYamlScalar(x)).join(', ')}]`);
    } else {
      lines.push(`${k}: ${serializeYamlScalar(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function serializeYamlScalar(v: any): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (/[:#\[\]{},&*!|>'"%@`\s]/.test(s) || s === '') return JSON.stringify(s);
  return s;
}

function emit(format: 'json' | 'text', data: any): void {
  if (format === 'json') {
    console.log(JSON.stringify(data));
  } else {
    if (typeof data === 'string') console.log(data);
    else console.log(JSON.stringify(data, null, 2));
  }
}

function logAudit(audit: boolean, instance: string, agent: string, op: string, relPath: string): void {
  if (!audit) return;
  try {
    const { spawnSync } = require('child_process');
    spawnSync('cortextos', [
      'bus', 'log-event', 'action', 'obsidian_modified', 'info',
      '--meta', JSON.stringify({ agent, op, path: relPath, instance }),
    ], { stdio: 'ignore' });
  } catch {
    // audit log is best-effort
  }
}

function readStdinSync(): string {
  const fs = require('fs');
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function withVaultContext(opts: BaseOptions) {
  validateInstanceId(opts.instance);
  validateAgentName(opts.agent);
  const global = loadGlobalConfig(opts.instance);
  const agentConfig = loadAgentConfig(opts.agent, opts.instance);
  return { global, agentConfig };
}

function ctxRootFor(instance: string): string {
  return join(homedir(), '.cortextos', instance);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function handleError(err: unknown, format: 'json' | 'text'): never {
  const code = (err as any)?.code || 'error';
  const message = (err as Error)?.message || String(err);
  if (format === 'json') {
    console.error(JSON.stringify({ error: code, message }));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(code === 'permission_denied' ? 3 : code === 'lock_timeout' ? 4 : code === 'path_escape' ? 5 : 1);
}

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

export const obsidianCommand = new Command('obsidian')
  .description('Operate on the Obsidian vault declared in obsidian.json with per-agent permission scoping.');

function addBaseOptions(cmd: Command): Command {
  return cmd
    .option('--instance <id>', 'Instance ID', process.env.CTX_INSTANCE_ID || 'default')
    .option('--agent <name>', 'Agent name making the request', process.env.CTX_AGENT_NAME || '')
    .option('--format <fmt>', 'Output format: json|text', (process.env.CTX_FORMAT as any) || 'json');
}

addBaseOptions(
  obsidianCommand
    .command('write-note')
    .argument('<path>', 'Vault-relative path to the note (e.g. Projects/X/foo.md)')
    .option('--content <str>', 'Note body. Mutually exclusive with --from-stdin.')
    .option('--from-stdin', 'Read note body from stdin')
    .option('--frontmatter <json>', 'JSON object to write as YAML frontmatter')
    .option('--overwrite', 'Overwrite if file exists (default: error)')
    .description('Write a note (with optional YAML frontmatter) to the vault')
).action((path: string, options: WriteNoteOptions) => {
  try {
    const { global, agentConfig } = withVaultContext(options);
    const { absolute, relative: rel } = resolveVaultPath(global.vault_path, path);
    ensurePermission(agentConfig, rel, 'write');

    if (existsSync(absolute) && !options.overwrite) {
      throw new Error(`Note already exists at ${rel}. Pass --overwrite to replace.`);
    }

    let body = '';
    if (options.fromStdin && options.content) {
      throw new Error('--content and --from-stdin are mutually exclusive');
    }
    if (options.fromStdin) body = readStdinSync();
    else if (options.content !== undefined) body = options.content;

    let fm: Record<string, any> | null = null;
    if (options.frontmatter) {
      try { fm = JSON.parse(options.frontmatter); }
      catch { throw new Error('--frontmatter must be valid JSON'); }
    }

    const text = (fm ? serializeFrontmatter(fm) : '') + body;

    mkdirSync(dirname(absolute), { recursive: true });
    const lock = acquireFileLock(ctxRootFor(options.instance), absolute, global.lock_timeout_ms);
    try {
      atomicWriteSync(absolute, text);
    } finally {
      lock.release();
    }
    logAudit(global.audit_log === true, options.instance, options.agent, 'write', rel);
    emit(options.format, { ok: true, op: 'write-note', path: rel, bytes: Buffer.byteLength(text, 'utf-8') });
  } catch (err) {
    handleError(err, options.format);
  }
});

addBaseOptions(
  obsidianCommand
    .command('append-note')
    .argument('<path>', 'Vault-relative path to the note')
    .argument('<text>', 'Text to append (newline added automatically)')
    .description('Append text to an existing note')
).action((path: string, text: string, options: AppendOptions) => {
  try {
    const { global, agentConfig } = withVaultContext(options);
    const { absolute, relative: rel } = resolveVaultPath(global.vault_path, path);
    ensurePermission(agentConfig, rel, 'append');

    mkdirSync(dirname(absolute), { recursive: true });
    const lock = acquireFileLock(ctxRootFor(options.instance), absolute, global.lock_timeout_ms);
    try {
      const existing = existsSync(absolute) ? readFileSync(absolute, 'utf-8') : '';
      const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
      atomicWriteSync(absolute, existing + sep + text);
    } finally {
      lock.release();
    }
    logAudit(global.audit_log === true, options.instance, options.agent, 'append', rel);
    emit(options.format, { ok: true, op: 'append-note', path: rel });
  } catch (err) {
    handleError(err, options.format);
  }
});

addBaseOptions(
  obsidianCommand
    .command('append-daily')
    .argument('<text>', 'Text to append to today\'s daily note')
    .option('--folder <path>', 'Folder for daily notes (vault-relative)', 'Daily')
    .description("Append text to today's daily note (creates it if missing)")
).action((text: string, options: AppendDailyOptions) => {
  try {
    const { global, agentConfig } = withVaultContext(options);
    const dailyPath = join(options.folder, `${isoToday()}.md`).split(sep).join('/');
    const { absolute, relative: rel } = resolveVaultPath(global.vault_path, dailyPath);
    ensurePermission(agentConfig, rel, 'append');

    mkdirSync(dirname(absolute), { recursive: true });
    const lock = acquireFileLock(ctxRootFor(options.instance), absolute, global.lock_timeout_ms);
    try {
      const existing = existsSync(absolute) ? readFileSync(absolute, 'utf-8') : '';
      const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
      atomicWriteSync(absolute, existing + sep + text);
    } finally {
      lock.release();
    }
    logAudit(global.audit_log === true, options.instance, options.agent, 'append', rel);
    emit(options.format, { ok: true, op: 'append-daily', path: rel });
  } catch (err) {
    handleError(err, options.format);
  }
});

addBaseOptions(
  obsidianCommand
    .command('read-note')
    .argument('<path>', 'Vault-relative path to the note')
    .option('--frontmatter-only', 'Return only the parsed frontmatter')
    .description('Read a note (with frontmatter parsed) from the vault')
).action((path: string, options: ReadNoteOptions) => {
  try {
    const { global, agentConfig } = withVaultContext(options);
    const { absolute, relative: rel } = resolveVaultPath(global.vault_path, path);
    ensurePermission(agentConfig, rel, 'read');
    if (!existsSync(absolute)) throw new Error(`Note does not exist: ${rel}`);
    const text = readFileSync(absolute, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(text);
    if (options.frontmatterOnly) emit(options.format, { ok: true, path: rel, frontmatter });
    else emit(options.format, { ok: true, path: rel, frontmatter, body });
  } catch (err) {
    handleError(err, options.format);
  }
});

addBaseOptions(
  obsidianCommand
    .command('search-by-tag')
    .argument('<tag>', 'Tag to match (without #)')
    .option('--folder <path>', 'Restrict search to this folder (vault-relative)')
    .description('Find notes whose frontmatter `tags` contains the given tag')
).action((tag: string, options: SearchByTagOptions) => {
  try {
    const { global, agentConfig } = withVaultContext(options);
    const root = options.folder
      ? resolveVaultPath(global.vault_path, options.folder).absolute
      : global.vault_path;
    const matches: Array<{ path: string; tags: any[] }> = [];
    walkVault(root, global.vault_path, (absPath, relPath) => {
      if (!relPath.endsWith('.md')) return;
      const decision = checkPermission(agentConfig, relPath, 'read');
      if (!decision.allowed) return;
      try {
        const text = readFileSync(absPath, 'utf-8');
        const { frontmatter } = parseFrontmatter(text);
        const tags = Array.isArray(frontmatter?.tags) ? frontmatter!.tags : [];
        if (tags.map((t) => String(t)).includes(tag)) matches.push({ path: relPath, tags });
      } catch { /* skip unreadable */ }
    });
    emit(options.format, { ok: true, tag, matches });
  } catch (err) {
    handleError(err, options.format);
  }
});

addBaseOptions(
  obsidianCommand
    .command('list-notes')
    .argument('<folder>', 'Vault-relative folder to list')
    .option('--recursive', 'Recurse into subfolders')
    .description('List notes in a folder (filtered to readable scopes)')
).action((folder: string, options: ListNotesOptions) => {
  try {
    const { global, agentConfig } = withVaultContext(options);
    const root = resolveVaultPath(global.vault_path, folder).absolute;
    const items: Array<{ path: string; bytes: number; mtime: string }> = [];
    if (options.recursive) {
      walkVault(root, global.vault_path, (absPath, relPath) => {
        if (!relPath.endsWith('.md')) return;
        const decision = checkPermission(agentConfig, relPath, 'read');
        if (!decision.allowed) return;
        const st = statSync(absPath);
        items.push({ path: relPath, bytes: st.size, mtime: st.mtime.toISOString() });
      });
    } else {
      if (existsSync(root)) {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
          const absPath = join(root, entry.name);
          const relPath = relative(global.vault_path, absPath).split(sep).join('/');
          const decision = checkPermission(agentConfig, relPath, 'read');
          if (!decision.allowed) continue;
          const st = statSync(absPath);
          items.push({ path: relPath, bytes: st.size, mtime: st.mtime.toISOString() });
        }
      }
    }
    emit(options.format, { ok: true, folder, items });
  } catch (err) {
    handleError(err, options.format);
  }
});

addBaseOptions(
  obsidianCommand
    .command('update-frontmatter')
    .argument('<path>', 'Vault-relative path to the note')
    .argument('<key>', 'Frontmatter key to set')
    .argument('<value>', 'Value (parsed as JSON if it looks like one, else stored as string)')
    .description('Update a single frontmatter key in an existing note (creates frontmatter if missing)')
).action((path: string, key: string, value: string, options: BaseOptions) => {
  try {
    const { global, agentConfig } = withVaultContext(options);
    const { absolute, relative: rel } = resolveVaultPath(global.vault_path, path);
    ensurePermission(agentConfig, rel, 'write');
    if (!existsSync(absolute)) throw new Error(`Note does not exist: ${rel}`);

    let parsedValue: any = value;
    try { parsedValue = JSON.parse(value); } catch { /* keep as string */ }

    const lock = acquireFileLock(ctxRootFor(options.instance), absolute, global.lock_timeout_ms);
    try {
      const text = readFileSync(absolute, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(text);
      const fm = { ...(frontmatter || {}), [key]: parsedValue };
      atomicWriteSync(absolute, serializeFrontmatter(fm) + body);
    } finally {
      lock.release();
    }
    logAudit(global.audit_log === true, options.instance, options.agent, 'update-frontmatter', rel);
    emit(options.format, { ok: true, op: 'update-frontmatter', path: rel, key, value: parsedValue });
  } catch (err) {
    handleError(err, options.format);
  }
});

function walkVault(
  root: string,
  vaultRoot: string,
  visit: (absolutePath: string, vaultRelativePath: string) => void,
): void {
  if (!existsSync(root)) return;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        const rel = relative(vaultRoot, abs).split(sep).join('/');
        visit(abs, rel);
      }
    }
  }
}
