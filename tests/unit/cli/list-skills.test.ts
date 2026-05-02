import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';

// Integration tests: spawn the real CLI in a sandbox repo so we exercise
// findTemplateRoot's cwd-based resolution. Each test builds a fake repo
// layout with templates/, community/skills/, and an agent dir.

let repoRoot: string;
const cliPath = join(__dirname, '..', '..', '..', 'dist', 'cli.js');

function makeSkill(dir: string, name: string, description: string): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    'utf-8',
  );
}

function runListSkills(agentDir: string, format: 'json' | 'text' = 'json'): string {
  return execFileSync(
    process.execPath,
    [cliPath, 'list-skills', '--agent-dir', agentDir, '--format', format],
    { encoding: 'utf-8', cwd: repoRoot },
  );
}

beforeEach(() => {
  repoRoot = join(tmpdir(), `ls-${randomBytes(6).toString('hex')}`);
  mkdirSync(join(repoRoot, 'templates', 'agent'), { recursive: true });
  mkdirSync(join(repoRoot, 'community', 'skills'), { recursive: true });
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('list-skills sources', () => {
  it('discovers community skills', () => {
    makeSkill(join(repoRoot, 'community', 'skills'), 'my-community-skill', 'A shared skill');
    const agentDir = join(repoRoot, 'agents', 'developer');
    mkdirSync(agentDir, { recursive: true });

    const out = runListSkills(agentDir);
    const skills = JSON.parse(out);
    const found = skills.find((s: any) => s.name === 'my-community-skill');
    expect(found).toBeDefined();
    expect(found.source).toBe('community');
    expect(found.description).toBe('A shared skill');
  });

  it('agent-level skill overrides community skill of same name', () => {
    makeSkill(join(repoRoot, 'community', 'skills'), 'shared-name', 'community version');
    const agentDir = join(repoRoot, 'agents', 'developer');
    mkdirSync(join(agentDir, 'skills'), { recursive: true });
    makeSkill(join(agentDir, 'skills'), 'shared-name', 'agent override');

    const out = runListSkills(agentDir);
    const skills = JSON.parse(out);
    const found = skills.find((s: any) => s.name === 'shared-name');
    expect(found.source).toBe('agent');
    expect(found.description).toBe('agent override');
  });

  it('framework + community + agent skills all coexist', () => {
    mkdirSync(join(repoRoot, 'skills'), { recursive: true });
    makeSkill(join(repoRoot, 'skills'), 'fw-only', 'framework');
    makeSkill(join(repoRoot, 'community', 'skills'), 'community-only', 'community');
    const agentDir = join(repoRoot, 'agents', 'developer');
    mkdirSync(join(agentDir, 'skills'), { recursive: true });
    makeSkill(join(agentDir, 'skills'), 'agent-only', 'agent');

    const out = runListSkills(agentDir);
    const skills = JSON.parse(out);
    const names = new Set(skills.map((s: any) => s.name));
    expect(names.has('fw-only')).toBe(true);
    expect(names.has('community-only')).toBe(true);
    expect(names.has('agent-only')).toBe(true);
  });

  it('--filter flag still narrows the result', () => {
    makeSkill(join(repoRoot, 'community', 'skills'), 'browser-automation', 'Drive a browser');
    makeSkill(join(repoRoot, 'community', 'skills'), 'obsidian-vault', 'Vault ops');
    const agentDir = join(repoRoot, 'agents', 'developer');
    mkdirSync(agentDir, { recursive: true });

    const out = execFileSync(
      process.execPath,
      [cliPath, 'list-skills', '--agent-dir', agentDir, '--format', 'json', '--filter', 'browser'],
      { encoding: 'utf-8', cwd: repoRoot },
    );
    const skills = JSON.parse(out);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe('browser-automation');
  });
});
