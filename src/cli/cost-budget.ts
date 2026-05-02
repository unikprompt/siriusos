import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { validateInstanceId } from '../utils/validate.js';
import {
  loadConfig,
  saveConfig,
  defaultCtxRoot,
  runCheck,
  DEFAULT_BUDGET,
  type CostBudgetConfig,
} from '../utils/cost-budget.js';

interface BaseOpts {
  instance: string;
  format: 'json' | 'text';
}

interface SetOpts extends BaseOpts {
  weeklyBudget?: string;
  thresholds?: string;
  chatId?: string;
  resetDow?: string;
  resetHour?: string;
  timezone?: string;
  enable?: boolean;
  disable?: boolean;
}

interface CheckOpts extends BaseOpts {
  notify?: boolean;
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

function resolveCtxRoot(opts: BaseOpts): string {
  const inst = opts.instance || process.env.CTX_INSTANCE_ID || 'default';
  validateInstanceId(inst);
  return defaultCtxRoot(inst);
}

function addBaseOptions<T extends Command>(cmd: T): T {
  return cmd
    .option('--instance <id>', 'Instance ID', process.env.CTX_INSTANCE_ID || 'default')
    .option('--format <fmt>', 'Output format: json|text', 'json') as T;
}

export const costBudgetCommand = new Command('cost-budget').description(
  'Configure and check weekly Anthropic cost budget; alerts via Telegram when thresholds cross',
);

addBaseOptions(
  costBudgetCommand
    .command('set')
    .option('--weekly-budget <usd>', 'Weekly budget in USD (e.g. 100)')
    .option('--thresholds <list>', 'Comma-separated alert thresholds in percent (e.g. 50,80,100)')
    .option('--chat-id <id>', 'Telegram chat ID to notify')
    .option('--reset-dow <day>', 'Day of week the period resets (sunday..saturday)')
    .option('--reset-hour <h>', 'Hour of day (0-23) the period resets in --timezone')
    .option('--timezone <tz>', 'IANA timezone for reset (e.g. America/New_York)')
    .option('--enable', 'Enable budget alerts')
    .option('--disable', 'Disable budget alerts')
    .description('Bootstrap or update cost budget config (creates config/cost-budget.json)'),
).action((opts: SetOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const existing = loadConfig(ctxRoot);
    const cfg: CostBudgetConfig = existing
      ? { ...DEFAULT_BUDGET, ...existing }
      : { ...DEFAULT_BUDGET };

    if (opts.weeklyBudget !== undefined) {
      const n = Number(opts.weeklyBudget);
      if (!isFinite(n) || n <= 0) fail(opts.format, 1, 'invalid --weekly-budget');
      cfg.weekly_budget_usd = n;
    }
    if (opts.thresholds !== undefined) {
      const parts = opts.thresholds.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
      if (parts.length === 0) fail(opts.format, 1, 'invalid --thresholds');
      cfg.thresholds_pct = parts.sort((a, b) => a - b);
    }
    if (opts.chatId !== undefined) cfg.notify_chat_id = opts.chatId;
    if (opts.resetDow !== undefined) {
      const validDow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      if (!validDow.includes(opts.resetDow as any)) fail(opts.format, 1, 'invalid --reset-dow');
      cfg.reset.day_of_week = opts.resetDow as CostBudgetConfig['reset']['day_of_week'];
    }
    if (opts.resetHour !== undefined) {
      const h = Number(opts.resetHour);
      if (!Number.isInteger(h) || h < 0 || h > 23) fail(opts.format, 1, 'invalid --reset-hour');
      cfg.reset.hour_local = h;
    }
    if (opts.timezone !== undefined) cfg.reset.timezone = opts.timezone;
    if (opts.enable) cfg.enabled = true;
    if (opts.disable) cfg.enabled = false;

    saveConfig(ctxRoot, cfg);
    emit(opts.format, { ok: true, config: cfg });
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  costBudgetCommand
    .command('status')
    .description('Show current period status (no Telegram, no state mutation beyond fired thresholds)'),
).action((opts: BaseOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'cost-budget config not set; run `cortextos bus cost-budget set --weekly-budget <usd> --chat-id <id>` first');
    const result = runCheck({ cfg, ctxRoot });
    if (opts.format === 'text') {
      const lines = [
        `Cost budget — instance ${opts.instance}`,
        `  enabled: ${result.enabled}`,
        `  period start (UTC): ${result.period_start}`,
        `  weekly budget: $${result.weekly_budget_usd.toFixed(2)}`,
        `  spent so far: $${result.spent_usd.toFixed(2)} (${result.pct.toFixed(1)}%)`,
        `  days into period: ${result.days_into_period.toFixed(1)} / ${result.days_in_period}`,
        `  projected end-of-week: $${result.projected_eow_usd.toFixed(2)} (${result.projected_pct.toFixed(1)}%)`,
        `  thresholds: ${result.thresholds_pct.join(', ')}%`,
        `  fired this period: ${result.fired_thresholds_pct.join(', ') || '(none)'}`,
      ];
      emit('text', lines.join('\n'));
    } else {
      emit('json', result);
    }
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

function buildAlertMessage(threshold: number, result: ReturnType<typeof runCheck>): string {
  const severity = threshold >= 100 ? 'EMERGENCIA' : threshold >= 80 ? 'CRÍTICO' : 'AVISO';
  const lines = [
    `${severity} — Cost budget cruzó ${threshold}%`,
    ``,
    `Spent: $${result.spent_usd.toFixed(2)} de $${result.weekly_budget_usd.toFixed(2)} (${result.pct.toFixed(1)}%)`,
    `Días: ${result.days_into_period.toFixed(1)} / ${result.days_in_period}`,
    `Proyectado fin-de-semana: $${result.projected_eow_usd.toFixed(2)} (${result.projected_pct.toFixed(1)}%)`,
    `Período arranca: ${result.period_start}`,
  ];
  return lines.join('\n');
}

addBaseOptions(
  costBudgetCommand
    .command('check')
    .option('--no-notify', 'Compute and persist state but do not send Telegram alerts')
    .description('Run check, persist state, send Telegram alerts for newly-crossed thresholds (cron-callable)'),
).action((opts: CheckOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'cost-budget config not set');
    const result = runCheck({ cfg, ctxRoot });

    const notified: Array<{ threshold: number; sent: boolean; error?: string }> = [];
    const shouldNotify = cfg.enabled && opts.notify !== false && cfg.notify_chat_id;
    if (shouldNotify) {
      for (const t of result.newly_fired_thresholds_pct) {
        const msg = buildAlertMessage(t, result);
        const r = spawnSync(
          'cortextos',
          ['bus', 'send-telegram', cfg.notify_chat_id, msg, '--plain-text'],
          { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' },
        );
        if (r.status === 0) {
          notified.push({ threshold: t, sent: true });
        } else {
          notified.push({
            threshold: t,
            sent: false,
            error: (r.stderr || '').trim() || `exit ${r.status}`,
          });
        }
      }
    }

    emit(opts.format, { ...result, notified });
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});
