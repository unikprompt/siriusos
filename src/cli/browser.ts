import { Command } from 'commander';
import { readFileSync } from 'fs';
import { validateInstanceId } from '../utils/validate.js';
import {
  defaultCtxRoot,
  runScript,
  type BrowserStep,
  type BrowserScriptOptions,
} from '../utils/browser.js';

interface BaseOpts {
  instance: string;
  agent: string;
  format: 'json' | 'text';
  headless?: boolean;
  timeout?: string;
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

function buildOpts(opts: BaseOpts): BrowserScriptOptions {
  const inst = opts.instance || process.env.CTX_INSTANCE_ID || 'default';
  validateInstanceId(inst);
  const agent = opts.agent || process.env.CTX_AGENT_NAME || 'developer';
  const headless = opts.headless !== false;
  const timeoutMs = opts.timeout ? Number(opts.timeout) : undefined;
  if (timeoutMs !== undefined && (!isFinite(timeoutMs) || timeoutMs <= 0)) {
    fail(opts.format, 1, 'invalid --timeout');
  }
  return {
    agent,
    ctxRoot: defaultCtxRoot(inst),
    headless,
    defaultTimeoutMs: timeoutMs,
  };
}

function addBaseOptions<T extends Command>(cmd: T): T {
  return cmd
    .option('--instance <id>', 'Instance ID', process.env.CTX_INSTANCE_ID || 'default')
    .option('--agent <name>', 'Agent name (browser context is per-agent)', process.env.CTX_AGENT_NAME || 'developer')
    .option('--format <fmt>', 'Output format: json|text', 'json')
    .option('--no-headless', 'Run browser headful (for debugging)')
    .option('--timeout <ms>', 'Default per-step timeout in ms') as T;
}

async function runAndEmit(opts: BaseOpts, steps: BrowserStep[]): Promise<void> {
  try {
    const result = await runScript(steps, buildOpts(opts));
    emit(opts.format, result);
    if (!result.ok) process.exit(2);
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
}

export const browserCommand = new Command('browser').description(
  'Browser automation via Playwright; per-agent persistent context (cookies, localStorage). Requires `npm install playwright && npx playwright install chromium`.',
);

addBaseOptions(
  browserCommand
    .command('open')
    .argument('<url>', 'URL to navigate to')
    .description('Open a URL and return title + status (validates connectivity, warms context)'),
).action(async (url: string, opts: BaseOpts) => {
  await runAndEmit(opts, [{ action: 'open', url }]);
});

addBaseOptions(
  browserCommand
    .command('click')
    .argument('<selector>', 'CSS selector to click')
    .option('--url <url>', 'Optional URL to open before clicking')
    .description('Click an element. Use --url to navigate first.'),
).action(async (selector: string, opts: BaseOpts & { url?: string }) => {
  const steps: BrowserStep[] = [];
  if (opts.url) steps.push({ action: 'open', url: opts.url });
  steps.push({ action: 'click', selector });
  await runAndEmit(opts, steps);
});

addBaseOptions(
  browserCommand
    .command('fill')
    .argument('<selector>', 'CSS selector of input')
    .argument('<value>', 'Value to fill')
    .option('--url <url>', 'Optional URL to open before filling')
    .description('Fill an input field. Use --url to navigate first.'),
).action(async (selector: string, value: string, opts: BaseOpts & { url?: string }) => {
  const steps: BrowserStep[] = [];
  if (opts.url) steps.push({ action: 'open', url: opts.url });
  steps.push({ action: 'fill', selector, value });
  await runAndEmit(opts, steps);
});

addBaseOptions(
  browserCommand
    .command('extract')
    .argument('<selector>', 'CSS selector to extract text from')
    .option('--url <url>', 'Optional URL to open before extracting')
    .description('Extract text content of first matching element'),
).action(async (selector: string, opts: BaseOpts & { url?: string }) => {
  const steps: BrowserStep[] = [];
  if (opts.url) steps.push({ action: 'open', url: opts.url });
  steps.push({ action: 'extract', selector });
  await runAndEmit(opts, steps);
});

addBaseOptions(
  browserCommand
    .command('screenshot')
    .argument('<path>', 'Output path for screenshot file (.png)')
    .option('--url <url>', 'Optional URL to open before capturing')
    .description('Capture a full-page screenshot'),
).action(async (path: string, opts: BaseOpts & { url?: string }) => {
  const steps: BrowserStep[] = [];
  if (opts.url) steps.push({ action: 'open', url: opts.url });
  steps.push({ action: 'screenshot', path });
  await runAndEmit(opts, steps);
});

addBaseOptions(
  browserCommand
    .command('exec')
    .option('--file <path>', 'Path to JSON script file (array of steps)')
    .option('--from-stdin', 'Read JSON script from stdin')
    .description('Execute a multi-step JSON script (array of {action, selector, value, url, path, expression, timeout})'),
).action(async (opts: BaseOpts & { file?: string; fromStdin?: boolean }) => {
  let raw: string;
  try {
    if (opts.fromStdin) {
      raw = readFileSync(0, 'utf-8');
    } else if (opts.file) {
      raw = readFileSync(opts.file, 'utf-8');
    } else {
      fail(opts.format, 1, 'must provide --file <path> or --from-stdin');
    }
  } catch (err: any) {
    fail(opts.format, 1, `failed to read script: ${err.message || err}`);
  }
  let steps: BrowserStep[];
  try {
    steps = JSON.parse(raw!);
  } catch (err: any) {
    fail(opts.format, 1, `invalid JSON in script: ${err.message || err}`);
  }
  await runAndEmit(opts, steps!);
});
