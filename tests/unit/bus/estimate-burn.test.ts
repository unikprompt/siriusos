import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI = join(__dirname, '..', '..', '..', 'dist', 'cli.js');

function runCLI(args: string[], stdin?: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('node', [CLI, 'bus', 'estimate-burn', ...args], {
    input: stdin,
    encoding: 'utf-8',
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? -1,
  };
}

describe('bus estimate-burn', () => {
  let tmpDir: string;
  let briefPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'estimate-burn-'));
    // 400 chars → ~100 tokens brief, ~300 tokens execution at 3x, total 400
    briefPath = join(tmpDir, 'brief.md');
    writeFileSync(briefPath, 'x'.repeat(400), 'utf-8');
  });

  it('reads from a file path and prints the heuristic in human-readable form', () => {
    const r = runCLI([briefPath, '--json']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.chars).toBe(400);
    expect(out.brief_tokens).toBe(100);
    expect(out.factor).toBe(3);
    expect(out.execution_tokens_projected).toBe(300);
    expect(out.total).toBe(400);
    expect(out.budget).toBeNull();
  });

  it('respects a custom factor', () => {
    const r = runCLI([briefPath, '--factor', '5', '--json']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.execution_tokens_projected).toBe(500);
    expect(out.total).toBe(600);
  });

  it('exits 0 when total is under budget', () => {
    const r = runCLI([briefPath, '--budget', '1000', '--json']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.budget).toBe(1000);
    expect(out.exceeds_budget).toBe(false);
  });

  it('exits 1 when total exceeds budget', () => {
    const r = runCLI([briefPath, '--budget', '100', '--json']);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.budget).toBe(100);
    expect(out.exceeds_budget).toBe(true);
  });

  it('reads from stdin when no path is given', () => {
    const r = runCLI(['--json'], 'a'.repeat(800));
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.chars).toBe(800);
    expect(out.brief_tokens).toBe(200);
  });

  it('exits 2 on missing file', () => {
    const r = runCLI(['/nonexistent/path/brief.md']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('not found');
  });

  it('exits 2 on empty input', () => {
    const r = runCLI(['--json'], '');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('empty');
  });

  it('human-readable mode includes a Status line when budget is set', () => {
    const r = runCLI([briefPath, '--budget', '1000']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Brief tokens estimados: 100');
    expect(r.stdout).toContain('Execution proyectado');
    expect(r.stdout).toContain('Total: 400');
    expect(r.stdout).toContain('Budget actual: 1000');
    expect(r.stdout).toContain('Status: OK');
  });

  it('human-readable mode says N/A when no budget passed', () => {
    const r = runCLI([briefPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Budget actual: N/A');
  });
});
