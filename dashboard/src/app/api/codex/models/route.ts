import { spawn } from 'node:child_process';
import {
  FALLBACK_CODEX_MODELS,
  normalizeCodexModelCatalog,
  type CodexModelCatalogEntry,
} from '@/lib/codex-model-catalog';

export const dynamic = 'force-dynamic';

const LIVE_CACHE_MS = 5 * 60 * 1000;
const FAILURE_CACHE_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

interface CatalogCache {
  expiresAt: number;
  models: CodexModelCatalogEntry[];
  source: 'codex-app-server' | 'fallback';
  warning?: string;
}

let cache: CatalogCache | null = null;

function queryCodexModelCatalog(): Promise<CodexModelCatalogEntry[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['app-server'], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdoutBuffer = '';
    let stderr = '';
    let settled = false;

    const finish = (error?: Error, models?: CodexModelCatalogEntry[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
      if (error) reject(error);
      else resolve(models || []);
    };

    const send = (message: Record<string, unknown>) => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const timer = setTimeout(() => {
      finish(new Error('Codex model catalog timed out'));
    }, REQUEST_TIMEOUT_MS);

    child.on('error', error => finish(error));
    child.on('exit', code => {
      if (!settled) {
        finish(new Error(`Codex app-server exited before model/list (code ${code ?? 'unknown'}): ${stderr.trim()}`));
      }
    });

    child.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4_000);
    });

    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (message.id === 0) {
          send({ method: 'initialized', params: {} });
          send({ method: 'model/list', id: 1, params: { limit: 100, includeHidden: false } });
          continue;
        }

        if (message.id === 1) {
          const models = normalizeCodexModelCatalog(message.result);
          if (models.length === 0) {
            finish(new Error('Codex returned an empty or invalid model catalog'));
          } else {
            finish(undefined, models);
          }
        }
      }
    });

    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'siriusos_dashboard',
          title: 'SiriusOS Dashboard',
          version: '1.0.0',
        },
      },
    });
  });
}

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return Response.json({
      models: cache.models,
      source: cache.source,
      warning: cache.warning,
      cached: true,
    });
  }

  try {
    const models = await queryCodexModelCatalog();
    cache = {
      models,
      source: 'codex-app-server',
      expiresAt: now + LIVE_CACHE_MS,
    };
  } catch (error) {
    cache = {
      models: FALLBACK_CODEX_MODELS,
      source: 'fallback',
      warning: error instanceof Error ? error.message : 'Codex model catalog unavailable',
      expiresAt: now + FAILURE_CACHE_MS,
    };
  }

  return Response.json({
    models: cache.models,
    source: cache.source,
    warning: cache.warning,
    cached: false,
  });
}
