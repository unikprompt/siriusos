import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { validateInstanceId } from '../utils/validate.js';
import {
  loadConfig,
  saveConfig,
  defaultCtxRoot,
  logRun,
  resetCount,
  runCheck,
  DEFAULT_CONFIG,
  type RoutineRunsConfig,
} from '../utils/routine-runs.js';

interface BaseOpts {
  instance: string;
  format: 'json' | 'text';
}

interface SetOpts extends BaseOpts {
  dailyLimit?: string;
  thresholds?: string;
  chatId?: string;
  resetHour?: string;
  timezone?: string;
  enable?: boolean;
  disable?: boolean;
}

interface LogOpts extends BaseOpts {
  note?: string;
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

export const routineRunsCommand = new Command('routine-runs').description(
  'Track Anthropic cloud /schedule routine runs against the daily plan limit (default 15/day)',
);

addBaseOptions(
  routineRunsCommand
    .command('set')
    .option('--daily-limit <n>', 'Daily routine runs included by your Anthropic plan (default 15)')
    .option('--thresholds <list>', 'Comma-separated alert thresholds in percent (e.g. 80,100)')
    .option('--chat-id <id>', 'Telegram chat ID to notify')
    .option('--reset-hour <h>', 'Hour of day (0-23) the daily counter resets in --timezone')
    .option('--timezone <tz>', 'IANA timezone for the daily reset (e.g. America/New_York)')
    .option('--enable', 'Enable alerts')
    .option('--disable', 'Disable alerts')
    .description('Bootstrap or update routine-runs config (creates config/routine-runs.json)'),
).action((opts: SetOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const existing = loadConfig(ctxRoot);
    const cfg: RoutineRunsConfig = existing
      ? { ...DEFAULT_CONFIG, ...existing }
      : { ...DEFAULT_CONFIG };

    if (opts.dailyLimit !== undefined) {
      const n = Number(opts.dailyLimit);
      if (!Number.isInteger(n) || n <= 0) fail(opts.format, 1, 'invalid --daily-limit');
      cfg.daily_limit = n;
    }
    if (opts.thresholds !== undefined) {
      const parts = opts.thresholds.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
      if (parts.length === 0) fail(opts.format, 1, 'invalid --thresholds');
      cfg.thresholds_pct = parts.sort((a, b) => a - b);
    }
    if (opts.chatId !== undefined) cfg.notify_chat_id = opts.chatId;
    if (opts.resetHour !== undefined) {
      const h = Number(opts.resetHour);
      if (!Number.isInteger(h) || h < 0 || h > 23) fail(opts.format, 1, 'invalid --reset-hour');
      cfg.reset_hour_local = h;
    }
    if (opts.timezone !== undefined) cfg.timezone = opts.timezone;
    if (opts.enable) cfg.enabled = true;
    if (opts.disable) cfg.enabled = false;

    saveConfig(ctxRoot, cfg);
    emit(opts.format, { ok: true, config: cfg });
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  routineRunsCommand
    .command('log')
    .option('--note <text>', 'Optional note (e.g. which schedule was created)')
    .description('Increment today\'s routine-runs counter (call after each /schedule cloud cron)'),
).action((opts: LogOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'routine-runs config not set; run `cortextos bus routine-runs set --chat-id <id>` first');
    const result = logRun({ cfg, ctxRoot, note: opts.note });
    emit(opts.format, result);
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  routineRunsCommand
    .command('status')
    .description('Show today\'s routine-runs count, period start, and fired thresholds'),
).action((opts: BaseOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'routine-runs config not set; run `cortextos bus routine-runs set --chat-id <id>` first');
    const result = runCheck({ cfg, ctxRoot });
    if (opts.format === 'text') {
      const lines = [
        `Routine runs — instance ${opts.instance}`,
        `  enabled: ${result.enabled}`,
        `  period start (UTC): ${result.period_start}`,
        `  used today: ${result.count} / ${result.daily_limit} (${result.pct.toFixed(1)}%)`,
        `  thresholds: ${result.thresholds_pct.join(', ')}% — fired: ${result.fired_thresholds_pct.join(', ') || '(none)'}`,
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
    `${severity} — Routine runs cruzó ${threshold}%`,
    ``,
    `Usado hoy: ${result.count} / ${result.daily_limit} (${result.pct.toFixed(1)}%)`,
    `Período arranca: ${result.period_start}`,
    `Thresholds firing-side: ${result.thresholds_pct.join(', ')}%`,
  ];
  return lines.join('\n');
}

addBaseOptions(
  routineRunsCommand
    .command('check')
    .option('--no-notify', 'Compute and persist state but do not send Telegram alerts')
    .description('Run check, persist state, send Telegram alerts for newly-crossed thresholds (cron-callable)'),
).action((opts: CheckOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'routine-runs config not set');
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

addBaseOptions(
  routineRunsCommand
    .command('reset')
    .description('Manually clear today\'s counter (use after restoring from snapshot or fixing miscount)'),
).action((opts: BaseOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'routine-runs config not set');
    const result = resetCount({ cfg, ctxRoot });
    emit(opts.format, result);
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});
