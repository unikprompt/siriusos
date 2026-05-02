import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  globMatch,
  resolveVaultPath,
  PathEscapeError,
  type ObsidianAgentConfig,
} from '../../../src/utils/obsidian-permissions';

describe('globMatch', () => {
  it('matches simple paths', () => {
    expect(globMatch('foo.md', 'foo.md')).toBe(true);
    expect(globMatch('foo.md', 'bar.md')).toBe(false);
  });

  it('* does not cross /', () => {
    expect(globMatch('Projects/*.md', 'Projects/foo.md')).toBe(true);
    expect(globMatch('Projects/*.md', 'Projects/sub/foo.md')).toBe(false);
  });

  it('** crosses /', () => {
    expect(globMatch('Projects/**', 'Projects/foo.md')).toBe(true);
    expect(globMatch('Projects/**', 'Projects/sub/deep/foo.md')).toBe(true);
    expect(globMatch('Projects/**', 'Other/foo.md')).toBe(false);
  });

  it('matches dotted extensions correctly', () => {
    expect(globMatch('**/*.md', 'a/b.md')).toBe(true);
    expect(globMatch('**/*.md', 'a/b.txt')).toBe(false);
  });
});

describe('resolveVaultPath', () => {
  const vault = '/vault/root';

  it('joins relative paths', () => {
    const r = resolveVaultPath(vault, 'Projects/foo.md');
    expect(r.absolute).toBe('/vault/root/Projects/foo.md');
    expect(r.relative).toBe('Projects/foo.md');
  });

  it('throws on path escape via ..', () => {
    expect(() => resolveVaultPath(vault, '../etc/passwd')).toThrow(PathEscapeError);
  });

  it('throws on absolute path outside vault', () => {
    expect(() => resolveVaultPath(vault, '/etc/passwd')).toThrow(PathEscapeError);
  });
});

describe('checkPermission — fail-closed allowlist', () => {
  const cfg: ObsidianAgentConfig = {
    scopes: [
      { paths: ['Projects/CortexLab/**'], permissions: ['read', 'write', 'append'] },
      { paths: ['Daily/**'], permissions: ['read', 'append'] },
      { paths: ['**'], permissions: ['read'] },
    ],
  };

  it('grants write inside CortexLab', () => {
    const d = checkPermission(cfg, 'Projects/CortexLab/notes/foo.md', 'write');
    expect(d.allowed).toBe(true);
  });

  it('denies write outside CortexLab', () => {
    const d = checkPermission(cfg, 'Projects/Other/foo.md', 'write');
    expect(d.allowed).toBe(false);
  });

  it('grants read on global wildcard', () => {
    const d = checkPermission(cfg, 'Random/foo.md', 'read');
    expect(d.allowed).toBe(true);
  });

  it('denies append outside Daily', () => {
    const d = checkPermission(cfg, 'Random/foo.md', 'append');
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('append');
  });

  it('most-specific scope wins (CortexLab over **)', () => {
    const d = checkPermission(cfg, 'Projects/CortexLab/foo.md', 'append');
    expect(d.allowed).toBe(true);
  });

  it('fail-closed: empty config denies everything', () => {
    const empty: ObsidianAgentConfig = { scopes: [] };
    expect(checkPermission(empty, 'foo.md', 'read').allowed).toBe(false);
    expect(checkPermission(empty, 'foo.md', 'write').allowed).toBe(false);
  });
});
