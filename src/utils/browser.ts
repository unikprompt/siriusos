import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type BrowserAction =
  | 'open'
  | 'click'
  | 'fill'
  | 'extract'
  | 'screenshot'
  | 'wait'
  | 'eval';

export interface BrowserStep {
  action: BrowserAction;
  url?: string;
  selector?: string;
  value?: string;
  path?: string;
  expression?: string;
  timeout?: number;
}

export interface BrowserStepResult {
  action: BrowserAction;
  ok: boolean;
  details: Record<string, unknown>;
  error?: string;
  duration_ms: number;
}

export interface BrowserScriptOptions {
  agent: string;
  ctxRoot: string;
  headless?: boolean;
  defaultTimeoutMs?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface BrowserScriptResult {
  ok: boolean;
  agent: string;
  steps: BrowserStepResult[];
  context_dir: string;
  final_url: string | null;
  error?: string;
}

export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export function defaultCtxRoot(instance: string = 'default'): string {
  return join(homedir(), '.cortextos', instance);
}

export function getContextDir(ctxRoot: string, agent: string): string {
  return join(ctxRoot, 'state', agent, 'browser');
}

export function ensureContextDir(ctxRoot: string, agent: string): string {
  const dir = getContextDir(ctxRoot, agent);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function validateScript(steps: BrowserStep[]): string | null {
  if (!Array.isArray(steps)) return 'script must be an array';
  if (steps.length === 0) return 'script must have at least one step';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s || typeof s !== 'object') return `step ${i}: not an object`;
    const validActions: BrowserAction[] = ['open', 'click', 'fill', 'extract', 'screenshot', 'wait', 'eval'];
    if (!validActions.includes(s.action)) return `step ${i}: invalid action "${s.action}"`;
    switch (s.action) {
      case 'open':
        if (!s.url) return `step ${i}: open requires url`;
        break;
      case 'click':
      case 'extract':
      case 'wait':
        if (!s.selector) return `step ${i}: ${s.action} requires selector`;
        break;
      case 'fill':
        if (!s.selector) return `step ${i}: fill requires selector`;
        if (s.value === undefined) return `step ${i}: fill requires value`;
        break;
      case 'screenshot':
        if (!s.path) return `step ${i}: screenshot requires path`;
        break;
      case 'eval':
        if (!s.expression) return `step ${i}: eval requires expression`;
        break;
    }
  }
  return null;
}

interface PlaywrightModule {
  chromium: {
    launchPersistentContext: (
      userDataDir: string,
      options: Record<string, unknown>,
    ) => Promise<any>;
  };
}

function loadPlaywright(): PlaywrightModule {
  try {
    return require('playwright');
  } catch {
    throw new Error(
      'playwright not installed. Run: npm install playwright && npx playwright install chromium',
    );
  }
}

export async function runScript(
  steps: BrowserStep[],
  opts: BrowserScriptOptions,
): Promise<BrowserScriptResult> {
  const validationError = validateScript(steps);
  if (validationError) {
    return {
      ok: false,
      agent: opts.agent,
      steps: [],
      context_dir: getContextDir(opts.ctxRoot, opts.agent),
      final_url: null,
      error: validationError,
    };
  }

  const contextDir = ensureContextDir(opts.ctxRoot, opts.agent);
  const headless = opts.headless !== false;
  const defaultTimeout = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const viewport = opts.viewport ?? DEFAULT_VIEWPORT;

  const playwright = loadPlaywright();
  const launchOpts: Record<string, unknown> = {
    headless,
    viewport,
    timeout: defaultTimeout,
  };
  if (opts.userAgent) launchOpts.userAgent = opts.userAgent;

  const ctx = await playwright.chromium.launchPersistentContext(contextDir, launchOpts);
  const results: BrowserStepResult[] = [];
  let finalUrl: string | null = null;
  let scriptOk = true;
  let scriptError: string | undefined;

  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    page.setDefaultTimeout(defaultTimeout);

    for (const step of steps) {
      const t0 = Date.now();
      try {
        const details = await runStep(page, step, defaultTimeout);
        results.push({
          action: step.action,
          ok: true,
          details,
          duration_ms: Date.now() - t0,
        });
      } catch (err: any) {
        const msg = err?.message || String(err);
        results.push({
          action: step.action,
          ok: false,
          details: { selector: step.selector, url: step.url },
          error: msg,
          duration_ms: Date.now() - t0,
        });
        scriptOk = false;
        scriptError = `step ${results.length - 1} (${step.action}): ${msg}`;
        break;
      }
    }

    try {
      finalUrl = page.url();
    } catch {
      finalUrl = null;
    }
  } finally {
    try {
      await ctx.close();
    } catch {
      // ignore close errors
    }
  }

  return {
    ok: scriptOk,
    agent: opts.agent,
    steps: results,
    context_dir: contextDir,
    final_url: finalUrl,
    error: scriptError,
  };
}

async function runStep(
  page: any,
  step: BrowserStep,
  defaultTimeout: number,
): Promise<Record<string, unknown>> {
  const timeout = step.timeout ?? defaultTimeout;
  switch (step.action) {
    case 'open': {
      const response = await page.goto(step.url!, { timeout, waitUntil: 'domcontentloaded' });
      return {
        url: page.url(),
        title: await page.title(),
        status: response?.status() ?? null,
      };
    }
    case 'click': {
      await page.click(step.selector!, { timeout });
      return { selector: step.selector };
    }
    case 'fill': {
      await page.fill(step.selector!, step.value!, { timeout });
      return { selector: step.selector };
    }
    case 'extract': {
      await page.waitForSelector(step.selector!, { timeout });
      const text = await page.locator(step.selector!).first().textContent();
      return { selector: step.selector, text: text?.trim() ?? '' };
    }
    case 'screenshot': {
      await page.screenshot({ path: step.path!, fullPage: true });
      return { path: step.path };
    }
    case 'wait': {
      await page.waitForSelector(step.selector!, { timeout });
      return { selector: step.selector };
    }
    case 'eval': {
      const result = await page.evaluate(step.expression!);
      return { result };
    }
  }
}
