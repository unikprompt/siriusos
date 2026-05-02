import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { validateInstanceId } from '../utils/validate.js';
import {
  loadConfig,
  saveConfig,
  defaultCtxRoot,
  detectAll,
  DEFAULT_CONFIG,
  type AnomalyDetectionConfig,
  type Anomaly,
} from '../utils/anomaly-detection.js';

interface BaseOpts {
  instance: string;
  format: 'json' | 'text';
}

interface SetOpts extends BaseOpts {
  chatId?: string;
  tokenMultiplier?: string;
  heartbeatHours?: string;
  completionDropPct?: string;
  baselineDays?: string;
  dedupHours?: string;
  agents?: string;
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

export const anomalyDetectionCommand = new Command('anomaly-detection').description(
  'Configure and run anomaly checks across agents (token spikes, stale heartbeats, completion drops); alerts via Telegram',
);

addBaseOptions(
  anomalyDetectionCommand
    .command('set')
    .option('--chat-id <id>', 'Telegram chat ID to notify')
    .option('--token-multiplier <n>', 'Multiplier over baseline median to fire token_spike (e.g. 2.5)')
    .option('--heartbeat-hours <n>', 'Hours of heartbeat staleness before firing (day-mode only)')
    .option('--completion-drop-pct <n>', 'Percent drop in completion rate vs prior window before firing')
    .option('--baseline-days <n>', 'Baseline window length in days (used for both token + completion)')
    .option('--dedup-hours <n>', 'Suppress repeat alerts for same (rule, agent) within N hours')
    .option('--agents <list>', 'Comma-separated allowlist of agents (empty = all)')
    .option('--enable', 'Enable anomaly detection')
    .option('--disable', 'Disable anomaly detection')
    .description('Bootstrap or update anomaly-detection config (creates config/anomaly-detection.json)'),
).action((opts: SetOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const existing = loadConfig(ctxRoot);
    const cfg: AnomalyDetectionConfig = existing
      ? { ...DEFAULT_CONFIG, ...existing }
      : { ...DEFAULT_CONFIG };

    if (opts.chatId !== undefined) cfg.notify_chat_id = opts.chatId;
    if (opts.tokenMultiplier !== undefined) {
      const n = Number(opts.tokenMultiplier);
      if (!isFinite(n) || n <= 1) fail(opts.format, 1, 'invalid --token-multiplier (must be > 1)');
      cfg.token_multiplier = n;
    }
    if (opts.heartbeatHours !== undefined) {
      const n = Number(opts.heartbeatHours);
      if (!isFinite(n) || n <= 0) fail(opts.format, 1, 'invalid --heartbeat-hours');
      cfg.heartbeat_stale_hours = n;
    }
    if (opts.completionDropPct !== undefined) {
      const n = Number(opts.completionDropPct);
      if (!isFinite(n) || n <= 0 || n > 100) fail(opts.format, 1, 'invalid --completion-drop-pct (1-100)');
      cfg.completion_drop_pct = n;
    }
    if (opts.baselineDays !== undefined) {
      const n = Number(opts.baselineDays);
      if (!Number.isInteger(n) || n < 2) fail(opts.format, 1, 'invalid --baseline-days (>=2)');
      cfg.baseline_window_days = n;
    }
    if (opts.dedupHours !== undefined) {
      const n = Number(opts.dedupHours);
      if (!isFinite(n) || n <= 0) fail(opts.format, 1, 'invalid --dedup-hours');
      cfg.dedup_hours = n;
    }
    if (opts.agents !== undefined) {
      cfg.agents_filter = opts.agents
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (opts.enable) cfg.enabled = true;
    if (opts.disable) cfg.enabled = false;

    saveConfig(ctxRoot, cfg);
    emit(opts.format, { ok: true, config: cfg });
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

addBaseOptions(
  anomalyDetectionCommand
    .command('status')
    .description('Show current anomaly state without sending Telegram alerts'),
).action((opts: BaseOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'anomaly-detection config not set; run `cortextos bus anomaly-detection set --chat-id <id> --enable` first');
    const result = detectAll({ cfg, ctxRoot });
    if (opts.format === 'text') {
      const lines = [
        `Anomaly detection — instance ${opts.instance}`,
        `  enabled: ${result.enabled}`,
        `  agents checked: ${result.agents_checked}`,
        `  anomalies detected: ${result.anomalies.length}`,
        `  newly fired (would notify): ${result.newly_fired.length}`,
        `  suppressed by dedup: ${result.suppressed_dedup}`,
        `  checked at: ${result.checked_at}`,
      ];
      if (result.anomalies.length > 0) {
        lines.push('', 'Detected:');
        for (const a of result.anomalies) {
          lines.push(`  [${a.severity}] ${a.rule} / ${a.agent}: ${a.message}`);
        }
      }
      emit('text', lines.join('\n'));
    } else {
      emit('json', result);
    }
  } catch (err: any) {
    fail(opts.format, 1, err.message || String(err));
  }
});

function buildAlertMessage(a: Anomaly): string {
  const tag = a.severity === 'critical' ? 'CRÍTICO' : a.severity === 'warning' ? 'AVISO' : 'INFO';
  const ruleLabel: Record<typeof a.rule, string> = {
    token_spike: 'Token spike',
    heartbeat_stale: 'Heartbeat stale',
    completion_drop: 'Completion drop',
  };
  return [`${tag} — ${ruleLabel[a.rule]} (${a.agent})`, '', a.message].join('\n');
}

addBaseOptions(
  anomalyDetectionCommand
    .command('check')
    .option('--no-notify', 'Compute and persist state but do not send Telegram alerts')
    .description('Run anomaly detection, persist state, send Telegram alerts for newly-fired anomalies (cron-callable)'),
).action((opts: CheckOpts) => {
  try {
    const ctxRoot = resolveCtxRoot(opts);
    const cfg = loadConfig(ctxRoot);
    if (!cfg) fail(opts.format, 1, 'anomaly-detection config not set');
    const result = detectAll({ cfg, ctxRoot });

    const notified: Array<{ rule: string; agent: string; sent: boolean; error?: string }> = [];
    const shouldNotify = cfg.enabled && opts.notify !== false && cfg.notify_chat_id;
    if (shouldNotify) {
      for (const a of result.newly_fired) {
        const msg = buildAlertMessage(a);
        const r = spawnSync(
          'cortextos',
          ['bus', 'send-telegram', cfg.notify_chat_id, msg, '--plain-text'],
          { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' },
        );
        if (r.status === 0) {
          notified.push({ rule: a.rule, agent: a.agent, sent: true });
        } else {
          notified.push({
            rule: a.rule,
            agent: a.agent,
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
