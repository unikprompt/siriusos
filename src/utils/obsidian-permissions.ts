import { existsSync, readFileSync } from 'fs';
import { join, normalize, relative, isAbsolute, sep } from 'path';

export type ObsidianOp = 'read' | 'write' | 'append';

export interface ObsidianScope {
  paths: string[];
  permissions: ObsidianOp[];
}

export interface ObsidianAgentConfig {
  scopes: ObsidianScope[];
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  matchedScope?: ObsidianScope;
}

export class PermissionError extends Error {
  code = 'permission_denied';
}

export class PathEscapeError extends Error {
  code = 'path_escape';
}

export function readAgentObsidianConfig(agentConfigPath: string): ObsidianAgentConfig {
  if (!existsSync(agentConfigPath)) return { scopes: [] };
  try {
    const parsed = JSON.parse(readFileSync(agentConfigPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return { scopes: [] };
    const obs = parsed.obsidian;
    if (!obs || !Array.isArray(obs.scopes)) return { scopes: [] };
    const scopes: ObsidianScope[] = [];
    for (const s of obs.scopes) {
      if (!s || typeof s !== 'object') continue;
      const paths = Array.isArray(s.paths) ? s.paths.filter((p: unknown) => typeof p === 'string') : [];
      const perms = Array.isArray(s.permissions)
        ? s.permissions.filter((p: unknown): p is ObsidianOp => p === 'read' || p === 'write' || p === 'append')
        : [];
      if (paths.length > 0 && perms.length > 0) scopes.push({ paths, permissions: perms });
    }
    return { scopes };
  } catch {
    return { scopes: [] };
  }
}

/**
 * Resolve a vault-relative or absolute path to an absolute path under vault_path.
 * Throws PathEscapeError if the resolved path escapes the vault.
 */
export function resolveVaultPath(vaultPath: string, requestedPath: string): { absolute: string; relative: string } {
  const vaultNorm = normalize(vaultPath);
  const candidate = isAbsolute(requestedPath) ? requestedPath : join(vaultNorm, requestedPath);
  const candidateNorm = normalize(candidate);
  const rel = relative(vaultNorm, candidateNorm);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathEscapeError(`Path '${requestedPath}' escapes vault root '${vaultPath}'`);
  }
  return { absolute: candidateNorm, relative: rel.split(sep).join('/') };
}

/**
 * Match a vault-relative path (forward slashes) against a glob pattern.
 * Supports: `*` (any chars except /), `**` (any chars including /), `?` (single char).
 */
export function globMatch(pattern: string, path: string): boolean {
  const re = globToRegex(pattern);
  return re.test(path);
}

function globToRegex(pattern: string): RegExp {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        const next = pattern[i + 2];
        if (next === '/') {
          re += '(?:.*/)?';
          i += 3;
          continue;
        }
        re += '.*';
        i += 2;
        continue;
      }
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') { re += '[^/]'; i += 1; continue; }
    if (/[.+^${}()|[\]\\]/.test(c)) { re += '\\' + c; i += 1; continue; }
    re += c;
    i += 1;
  }
  re += '$';
  return new RegExp(re);
}

/**
 * Score a glob pattern by specificity. Higher score = more specific (longer literal prefix, fewer wildcards).
 * Used to pick the longest-prefix match when multiple scopes match.
 */
function scopeSpecificity(pattern: string): number {
  const literals = pattern.replace(/\*+|\?/g, '').length;
  const wildcards = (pattern.match(/\*\*|\*|\?/g) || []).length;
  return literals * 10 - wildcards;
}

/**
 * Decide if an agent may perform `op` on `relativePath` (vault-relative, forward slashes).
 * Fail-closed: no matching scope = deny.
 * Most-specific-match wins.
 */
export function checkPermission(
  config: ObsidianAgentConfig,
  relativePath: string,
  op: ObsidianOp,
): PermissionDecision {
  let best: { scope: ObsidianScope; specificity: number; pattern: string } | null = null;
  for (const scope of config.scopes) {
    for (const pattern of scope.paths) {
      if (globMatch(pattern, relativePath)) {
        const spec = scopeSpecificity(pattern);
        if (!best || spec > best.specificity) best = { scope, specificity: spec, pattern };
      }
    }
  }
  if (!best) {
    return { allowed: false, reason: `No scope matches '${relativePath}' (fail-closed default)` };
  }
  const allowed = best.scope.permissions.includes(op);
  if (!allowed) {
    return {
      allowed: false,
      reason: `Scope '${best.pattern}' grants [${best.scope.permissions.join(',')}] but op '${op}' was requested`,
      matchedScope: best.scope,
    };
  }
  return { allowed: true, reason: `Allowed by scope '${best.pattern}'`, matchedScope: best.scope };
}
