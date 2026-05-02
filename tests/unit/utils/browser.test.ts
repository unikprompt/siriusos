import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  validateScript,
  getContextDir,
  ensureContextDir,
  defaultCtxRoot,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_VIEWPORT,
  type BrowserStep,
} from '../../../src/utils/browser';

let ctxRoot: string;

beforeEach(() => {
  ctxRoot = join(tmpdir(), `br-${randomBytes(6).toString('hex')}`);
  mkdirSync(ctxRoot, { recursive: true });
});

afterEach(() => {
  rmSync(ctxRoot, { recursive: true, force: true });
});

describe('paths + defaults', () => {
  it('defaultCtxRoot uses ~/.cortextos/<instance>', () => {
    const p = defaultCtxRoot('default');
    expect(p).toMatch(/\.cortextos\/default$/);
  });

  it('getContextDir places browser dir under state/<agent>/browser', () => {
    expect(getContextDir(ctxRoot, 'developer')).toBe(
      join(ctxRoot, 'state', 'developer', 'browser'),
    );
  });

  it('ensureContextDir creates the dir if missing', () => {
    const dir = ensureContextDir(ctxRoot, 'developer');
    expect(existsSync(dir)).toBe(true);
  });

  it('ensureContextDir is idempotent', () => {
    ensureContextDir(ctxRoot, 'developer');
    ensureContextDir(ctxRoot, 'developer');
    expect(existsSync(getContextDir(ctxRoot, 'developer'))).toBe(true);
  });

  it('exposes sane default timeout + viewport', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    expect(DEFAULT_VIEWPORT.width).toBeGreaterThan(0);
    expect(DEFAULT_VIEWPORT.height).toBeGreaterThan(0);
  });
});

describe('validateScript', () => {
  it('rejects non-array input', () => {
    expect(validateScript('not an array' as any)).toBe('script must be an array');
  });

  it('rejects empty array', () => {
    expect(validateScript([])).toBe('script must have at least one step');
  });

  it('rejects unknown action', () => {
    expect(validateScript([{ action: 'jump' as any }])).toMatch(/invalid action/);
  });

  it('open requires url', () => {
    expect(validateScript([{ action: 'open' }])).toMatch(/open requires url/);
  });

  it('click requires selector', () => {
    expect(validateScript([{ action: 'click' }])).toMatch(/click requires selector/);
  });

  it('fill requires selector + value', () => {
    expect(validateScript([{ action: 'fill', selector: '#x' }])).toMatch(/fill requires value/);
    expect(validateScript([{ action: 'fill', value: 'x' }])).toMatch(/fill requires selector/);
  });

  it('extract requires selector', () => {
    expect(validateScript([{ action: 'extract' }])).toMatch(/extract requires selector/);
  });

  it('screenshot requires path', () => {
    expect(validateScript([{ action: 'screenshot' }])).toMatch(/screenshot requires path/);
  });

  it('eval requires expression', () => {
    expect(validateScript([{ action: 'eval' }])).toMatch(/eval requires expression/);
  });

  it('wait requires selector', () => {
    expect(validateScript([{ action: 'wait' }])).toMatch(/wait requires selector/);
  });

  it('accepts a valid multi-step script', () => {
    const steps: BrowserStep[] = [
      { action: 'open', url: 'https://example.com' },
      { action: 'fill', selector: '#email', value: 'a@b.com' },
      { action: 'click', selector: '#submit' },
      { action: 'wait', selector: '.dashboard' },
      { action: 'extract', selector: '.greeting' },
      { action: 'screenshot', path: '/tmp/x.png' },
      { action: 'eval', expression: 'document.title' },
    ];
    expect(validateScript(steps)).toBeNull();
  });

  it('reports the first failing step index', () => {
    const steps: BrowserStep[] = [
      { action: 'open', url: 'https://example.com' },
      { action: 'click' as BrowserStep['action'] }, // missing selector
      { action: 'extract', selector: '.x' },
    ];
    const err = validateScript(steps);
    expect(err).toMatch(/^step 1:/);
  });
});

describe('runScript without playwright installed', () => {
  it('returns validation error before attempting to load playwright', async () => {
    const { runScript } = await import('../../../src/utils/browser');
    const result = await runScript([], { agent: 'developer', ctxRoot });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('script must have at least one step');
    // Context dir is reported but never created (validation happens first)
    expect(result.context_dir).toBe(getContextDir(ctxRoot, 'developer'));
  });
});
