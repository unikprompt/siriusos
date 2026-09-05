'use client';

import { useState, useEffect } from 'react';
import { IconDeviceFloppy, IconSettings } from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  FALLBACK_CODEX_MODELS,
  getModelEffortOptions,
  selectCompatibleEffort,
  type CodexModelCatalogEntry,
  type CodexReasoningEffort,
} from '@/lib/codex-model-catalog';
import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  ANTHROPIC_EFFORT_OPTIONS,
  type AnthropicEffort,
} from '@/lib/anthropic-model-catalog';
import { isCodexRuntime } from '@/lib/agent-runtime';

type Provider = 'anthropic' | 'openai';
type Runtime = 'claude-code' | 'codex' | 'codex-app-server' | 'hermes';
type ReasoningEffort = CodexReasoningEffort;

const MODELS_BY_PROVIDER: Record<Provider, string[]> = {
  anthropic: ANTHROPIC_MODELS,
  openai: FALLBACK_CODEX_MODELS.map(entry => entry.model),
};

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: DEFAULT_ANTHROPIC_MODEL,
  openai: 'gpt-5.6-sol',
};

interface AgentConfig {
  timezone?: string;
  day_mode_start?: string;
  day_mode_end?: string;
  communication_style?: string;
  approval_rules?: {
    always_ask?: string[];
    never_ask?: string[];
  };
  provider?: Provider;
  runtime?: Runtime;
  model?: string;
  max_session_seconds?: number;
  max_crashes_per_day?: number;
  startup_delay?: number;
  reasoning_effort?: ReasoningEffort;
  claude_effort?: AnthropicEffort;
  ctx_warning_threshold?: number;
  ctx_handoff_threshold?: number;
}

interface SettingsTabProps {
  agentName: string;
}

const APPROVAL_CATEGORIES = ['external-comms', 'financial', 'deployment', 'data-deletion'] as const;

type MessageState = { type: 'success' | 'error'; text: string } | null;

interface BackendSnapshot {
  provider: Provider;
  runtime: Runtime;
  model?: string;
  reasoning_effort?: ReasoningEffort;
  claude_effort?: AnthropicEffort;
  ctx_warning_threshold?: number;
  ctx_handoff_threshold?: number;
}

function normalizeLoadedConfig(value: AgentConfig): AgentConfig {
  const runtime = value.runtime || 'claude-code';
  const provider = value.provider || (isCodexRuntime(runtime) ? 'openai' : 'anthropic');
  return { ...value, provider, runtime };
}

function backendSnapshot(value: AgentConfig): BackendSnapshot {
  const normalized = normalizeLoadedConfig(value);
  return {
    provider: normalized.provider!,
    runtime: normalized.runtime!,
    model: normalized.model,
    reasoning_effort: normalized.reasoning_effort,
    claude_effort: normalized.claude_effort,
    ctx_warning_threshold: normalized.ctx_warning_threshold,
    ctx_handoff_threshold: normalized.ctx_handoff_threshold,
  };
}

function sameBackend(a: BackendSnapshot, b: BackendSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const TIME_REGEX = /^\d{2}:\d{2}$/;

export function SettingsTab({ agentName }: SettingsTabProps) {
  const [config, setConfig] = useState<AgentConfig>({});
  const [loading, setLoading] = useState(true);

  // Section 1: Operational Config
  const [opSaving, setOpSaving] = useState(false);
  const [opMessage, setOpMessage] = useState<MessageState>(null);

  // Time validation errors
  const [startError, setStartError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  // Section 2: Agent Config
  const [agSaving, setAgSaving] = useState(false);
  const [agMessage, setAgMessage] = useState<MessageState>(null);
  const [initialBackend, setInitialBackend] = useState<BackendSnapshot>(() => backendSnapshot({}));
  const [restarting, setRestarting] = useState(false);
  const [codexModels, setCodexModels] = useState<CodexModelCatalogEntry[]>(FALLBACK_CODEX_MODELS);
  const [codexCatalogSource, setCodexCatalogSource] = useState<'codex-app-server' | 'fallback'>('fallback');
  const [codexCatalogWarning, setCodexCatalogWarning] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/agents/${encodeURIComponent(agentName)}/config`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        if (!controller.signal.aborted && d.config) {
          const normalized = normalizeLoadedConfig(d.config);
          setConfig(normalized);
          setInitialBackend(backendSnapshot(normalized));
        }
        if (!controller.signal.aborted) setLoading(false);
      })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false); });

    fetch('/api/codex/models', { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        if (controller.signal.aborted) return;
        if (Array.isArray(d.models) && d.models.length > 0) setCodexModels(d.models);
        setCodexCatalogSource(d.source === 'codex-app-server' ? 'codex-app-server' : 'fallback');
        setCodexCatalogWarning(typeof d.warning === 'string' ? d.warning : null);
      })
      .catch(err => {
        if (err.name !== 'AbortError') setCodexCatalogWarning('No se pudo consultar Codex; usando catálogo de respaldo.');
      });
    return () => controller.abort();
  }, [agentName]);

  const updateApprovalList = (list: 'always_ask' | 'never_ask', cat: string) => {
    const opposite = list === 'always_ask' ? 'never_ask' : 'always_ask';
    setConfig(prev => {
      const rules = prev.approval_rules || {};
      const current = rules[list] || [];
      const oppositeList = rules[opposite] || [];
      const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
      // Enforce mutual exclusion: remove from opposite list when adding to this one
      const nextOpposite = next.includes(cat) ? oppositeList.filter(c => c !== cat) : oppositeList;
      return {
        ...prev,
        approval_rules: {
          ...rules,
          [list]: next,
          [opposite]: nextOpposite,
        },
      };
    });
  };

  const validateTimes = (): boolean => {
    let valid = true;
    const start = config.day_mode_start || '';
    const end = config.day_mode_end || '';
    if (start && !TIME_REGEX.test(start)) {
      setStartError('Must be HH:MM format (e.g. 08:00)');
      valid = false;
    } else {
      setStartError(null);
    }
    if (end && !TIME_REGEX.test(end)) {
      setEndError('Must be HH:MM format (e.g. 00:00)');
      valid = false;
    } else {
      setEndError(null);
    }
    return valid;
  };

  const saveSection = async (
    fields: Partial<AgentConfig>,
    setSaving: (v: boolean) => void,
    setMessage: (m: MessageState) => void,
  ): Promise<AgentConfig | null> => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentName)}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const d = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: d.error || 'No se pudo guardar' });
        return null;
      } else {
        const savedConfig = normalizeLoadedConfig(d.config || fields);
        if (d.config) setConfig(savedConfig);
        setMessage({ type: 'success', text: 'Configuración guardada en disco.' });
        return savedConfig;
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de red' });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveOpConfig = () => {
    if (!validateTimes()) return;
    saveSection(
      {
        timezone: config.timezone,
        day_mode_start: config.day_mode_start,
        day_mode_end: config.day_mode_end,
        communication_style: config.communication_style,
        approval_rules: config.approval_rules,
      },
      setOpSaving,
      setOpMessage,
    );
  };

  const saveAgConfig = async (restartAfterSave = false) => {
    const warning = config.ctx_warning_threshold;
    const handoff = config.ctx_handoff_threshold;
    if (warning !== undefined && handoff !== undefined && warning >= handoff) {
      setAgMessage({ type: 'error', text: 'El umbral de aviso debe ser menor que el de handoff.' });
      return;
    }

    const saved = await saveSection(
      {
        provider: config.provider,
        runtime: config.runtime,
        model: config.model,
        max_session_seconds: config.max_session_seconds,
        max_crashes_per_day: config.max_crashes_per_day,
        startup_delay: config.startup_delay,
        reasoning_effort: config.reasoning_effort,
        claude_effort: config.claude_effort,
        ctx_warning_threshold: warning,
        ctx_handoff_threshold: handoff,
      },
      setAgSaving,
      setAgMessage,
    );
    if (saved && restartAfterSave) await restartAgent(saved);
  };

  const restartAgent = async (activeConfig: AgentConfig = config) => {
    setRestarting(true);
    setAgMessage(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentName)}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAgMessage({ type: 'error', text: d.error || 'No se pudo reiniciar' });
      } else {
        setAgMessage({ type: 'success', text: 'Reinicio solicitado. La nueva configuración queda activa al completar el arranque.' });
        setInitialBackend(backendSnapshot(activeConfig));
      }
    } catch {
      setAgMessage({ type: 'error', text: 'Error de red durante el reinicio' });
    } finally {
      setRestarting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }

  const alwaysAsk = config.approval_rules?.always_ask || [];
  const neverAsk = config.approval_rules?.never_ask || [];
  const selectedCodexModel = codexModels.find(entry => entry.model === config.model);
  const effortOptions = getModelEffortOptions(codexModels, config.model);
  const selectedEffort = selectCompatibleEffort(
    codexModels,
    config.model || codexModels.find(entry => entry.isDefault)?.model || DEFAULT_MODEL.openai,
    config.reasoning_effort,
  );
  const codexRuntimeSelected = isCodexRuntime(config.runtime);
  const claudeCodeSelected = (config.runtime || 'claude-code') === 'claude-code';
  const backendChanged = !sameBackend(initialBackend, backendSnapshot(config));

  return (
    <div className="space-y-4 p-1">
      {/* Section 1: Operational Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconSettings size={16} className="text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Operational Config</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Timezone</label>
            <input
              type="text"
              value={config.timezone || ''}
              onChange={e => setConfig(p => ({ ...p, timezone: e.target.value }))}
              placeholder="America/New_York"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Day Mode Start</label>
              <input
                type="text"
                value={config.day_mode_start || ''}
                onChange={e => setConfig(p => ({ ...p, day_mode_start: e.target.value }))}
                onBlur={() => {
                  const val = config.day_mode_start || '';
                  if (val && !TIME_REGEX.test(val)) {
                    setStartError('Must be HH:MM format (e.g. 08:00)');
                  } else {
                    setStartError(null);
                  }
                }}
                placeholder="08:00"
                className={`mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none${startError ? ' border-destructive' : ''}`}
              />
              {startError && <p className="mt-1 text-xs text-destructive">{startError}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Day Mode End</label>
              <input
                type="text"
                value={config.day_mode_end || ''}
                onChange={e => setConfig(p => ({ ...p, day_mode_end: e.target.value }))}
                onBlur={() => {
                  const val = config.day_mode_end || '';
                  if (val && !TIME_REGEX.test(val)) {
                    setEndError('Must be HH:MM format (e.g. 00:00)');
                  } else {
                    setEndError(null);
                  }
                }}
                placeholder="00:00"
                className={`mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none${endError ? ' border-destructive' : ''}`}
              />
              {endError && <p className="mt-1 text-xs text-destructive">{endError}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Communication Style</label>
            <input
              type="text"
              value={config.communication_style || ''}
              onChange={e => setConfig(p => ({ ...p, communication_style: e.target.value }))}
              placeholder="casual, brief, proactive"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Always Require Approval</label>
            <div className="mt-2 flex flex-wrap gap-3">
              {APPROVAL_CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alwaysAsk.includes(cat)}
                    onChange={() => updateApprovalList('always_ask', cat)}
                    className="rounded"
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Never Require Approval</label>
            <div className="mt-2 flex flex-wrap gap-3">
              {APPROVAL_CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={neverAsk.includes(cat)}
                    onChange={() => updateApprovalList('never_ask', cat)}
                    className="rounded"
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>

          {opMessage && (
            <div className={`rounded-md px-3 py-2 text-xs ${opMessage.type === 'success' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
              {opMessage.text}
            </div>
          )}

          <button
            onClick={saveOpConfig}
            disabled={opSaving}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <IconDeviceFloppy size={14} />
            {opSaving ? 'Saving...' : 'Save Operational Config'}
          </button>
        </CardContent>
      </Card>

      {/* Section 2: Agent Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Agent Config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Provider</label>
            <select
              value={config.provider || 'anthropic'}
              onChange={e => {
                const nextProvider = e.target.value as Provider;
                setConfig(p => {
                  const nextRuntime: Runtime = nextProvider === 'openai'
                    ? (isCodexRuntime(p.runtime) ? p.runtime! : 'codex')
                    : (isCodexRuntime(p.runtime) ? 'claude-code' : p.runtime || 'claude-code');
                  const knownModels = nextProvider === 'openai'
                    ? codexModels.map(entry => entry.model)
                    : MODELS_BY_PROVIDER[nextProvider];
                  const currentModel = p.model || '';
                  const keepModel = knownModels.includes(currentModel);
                  const nextModel = keepModel
                    ? currentModel
                    : nextProvider === 'openai'
                      ? codexModels.find(entry => entry.isDefault)?.model || DEFAULT_MODEL.openai
                      : DEFAULT_MODEL.anthropic;
                  return {
                    ...p,
                    provider: nextProvider,
                    runtime: nextRuntime,
                    model: nextModel,
                    reasoning_effort: nextProvider === 'openai'
                      ? selectCompatibleEffort(codexModels, nextModel, p.reasoning_effort)
                      : p.reasoning_effort,
                  };
                });
              }}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="anthropic">Anthropic (Claude Code CLI)</option>
              <option value="openai">OpenAI (Codex CLI via ChatGPT)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {config.provider === 'openai'
                ? 'Usa la sesión de ChatGPT iniciada con `codex login`; no requiere una API key por agente.'
                : 'Usa la sesión de Anthropic mediante Claude Code CLI.'}
            </p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Runtime</label>
            <select
              value={config.runtime || 'claude-code'}
              onChange={e => {
                const nextRuntime = e.target.value as Runtime;
                setConfig(p => {
                  if (isCodexRuntime(nextRuntime)) {
                    const knownModels = codexModels.map(entry => entry.model);
                    const nextModel = p.model && knownModels.includes(p.model)
                      ? p.model
                      : codexModels.find(entry => entry.isDefault)?.model || DEFAULT_MODEL.openai;
                    return {
                      ...p,
                      runtime: nextRuntime,
                      provider: 'openai',
                      model: nextModel,
                      reasoning_effort: selectCompatibleEffort(codexModels, nextModel, p.reasoning_effort),
                    };
                  }
                  if (nextRuntime === 'claude-code') {
                    const nextModel = p.model && MODELS_BY_PROVIDER.anthropic.includes(p.model)
                      ? p.model
                      : DEFAULT_MODEL.anthropic;
                    return { ...p, runtime: nextRuntime, provider: 'anthropic', model: nextModel };
                  }
                  return { ...p, runtime: nextRuntime };
                });
              }}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="claude-code">Claude Code</option>
              <option value="codex">Codex Exec (estable y recomendado)</option>
              <option value="codex-app-server">Codex App Server (experimental)</option>
              <option value="hermes">Hermes (experimental)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {config.runtime === 'codex'
                ? 'Runtime OpenAI estable usado por el piloto. Ejecuta `codex exec`, conserva continuidad por sesión y carga las instrucciones del agente; los crons siguen bajo control del daemon.'
                : config.runtime === 'codex-app-server'
                ? 'Adaptador JSON-RPC experimental. Tiene un ciclo de contexto distinto y no es la opción recomendada para migraciones normales.'
                : config.runtime === 'hermes'
                ? 'Runtime interno/experimental; no recomendado para uso diario.'
                : 'Runtime estándar de Claude Code para agentes Anthropic.'}
            </p>
          </div>

          {codexRuntimeSelected && (
            <div>
              <label className="text-xs text-muted-foreground">Reasoning Effort</label>
              <select
                value={selectedEffort}
                onChange={e => setConfig(p => ({ ...p, reasoning_effort: e.target.value as ReasoningEffort }))}
                className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              >
                {effortOptions.map(option => (
                  <option key={option.reasoningEffort} value={option.reasoningEffort}>
                    {option.reasoningEffort} — {option.description || 'Compatible con este modelo'}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Los niveles se descubren desde Codex para el modelo seleccionado. Un nivel mayor puede aumentar latencia y consumo.
              </p>
            </div>
          )}

          {claudeCodeSelected && (
            <div>
              <label className="text-xs text-muted-foreground">Reasoning Effort</label>
              <select
                value={config.claude_effort ?? ''}
                onChange={e => setConfig(p => ({ ...p, claude_effort: e.target.value === '' ? undefined : e.target.value as AnthropicEffort }))}
                className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Default de Claude Code (xhigh)</option>
                {ANTHROPIC_EFFORT_OPTIONS.map(option => (
                  <option key={option.effort} value={option.effort}>
                    {option.effort} — {option.description}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Nivel de esfuerzo del modelo Anthropic (flag --effort de Claude Code). Sin selección, Claude Code usa su default (xhigh). Un nivel menor baja costo y latencia.
              </p>
            </div>
          )}

          {(() => {
            const provider: Provider = config.provider || 'anthropic';
            const knownModels = provider === 'openai'
              ? codexModels.map(entry => entry.model)
              : MODELS_BY_PROVIDER[provider];
            const currentModel = config.model || '';
            const isCustom = currentModel !== '' && !knownModels.includes(currentModel);
            const defaultModel = provider === 'openai'
              ? codexModels.find(entry => entry.isDefault)?.model || DEFAULT_MODEL.openai
              : DEFAULT_MODEL.anthropic;
            const selectValue = isCustom ? '__custom__' : currentModel || defaultModel;
            return (
              <div>
                <label className="text-xs text-muted-foreground">Model</label>
                <select
                  value={selectValue}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '__custom__') {
                      setConfig(p => ({ ...p, model: '' }));
                    } else {
                      setConfig(p => ({
                        ...p,
                        model: v,
                        reasoning_effort: provider === 'openai'
                          ? selectCompatibleEffort(codexModels, v, p.reasoning_effort)
                          : p.reasoning_effort,
                      }));
                    }
                  }}
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                >
                  {knownModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="__custom__">Custom...</option>
                </select>
                {(isCustom || selectValue === '__custom__') && (
                  <input
                    type="text"
                    value={config.model || ''}
                    onChange={e => setConfig(p => ({ ...p, model: e.target.value }))}
                    placeholder={`Custom ${provider} model ID`}
                    className="mt-2 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                )}
                {provider === 'openai' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Catálogo {codexCatalogSource === 'codex-app-server' ? 'en vivo desde Codex' : 'de respaldo'}.
                    {selectedCodexModel?.description ? ` ${selectedCodexModel.description}` : ''}
                  </p>
                )}
                {provider === 'openai' && selectedCodexModel?.upgrade && (
                  <div className="mt-2 rounded-md border border-warning/30 bg-warning/15 px-3 py-2 text-xs text-warning">
                    Codex recomienda actualizar este modelo a <strong>{selectedCodexModel.upgrade}</strong>.
                    {selectedCodexModel.upgradeMessage ? ` ${selectedCodexModel.upgradeMessage.replace(/\s+/g, ' ')}` : ''}
                  </div>
                )}
                {provider === 'openai' && codexCatalogWarning && (
                  <p className="mt-1 text-xs text-warning">{codexCatalogWarning}</p>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Max Session (sec)</label>
              <input
                type="number"
                value={config.max_session_seconds ?? ''}
                onChange={e => setConfig(p => ({ ...p, max_session_seconds: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="255600"
                className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Crashes/Day</label>
              <input
                type="number"
                value={config.max_crashes_per_day ?? ''}
                onChange={e => setConfig(p => ({ ...p, max_crashes_per_day: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="5"
                className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Startup Delay (sec)</label>
              <input
                type="number"
                value={config.startup_delay ?? ''}
                onChange={e => setConfig(p => ({ ...p, startup_delay: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="0"
                className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {codexRuntimeSelected && (
            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">Política de contexto</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Política estable recomendada: aviso al 65% y handoff explícito al 80%.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig(p => ({ ...p, ctx_warning_threshold: 65, ctx_handoff_threshold: 80 }))}
                  className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                >
                  Aplicar 65/80
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Aviso (%)</label>
                  <input
                    type="number"
                    min={50}
                    max={95}
                    value={config.ctx_warning_threshold ?? ''}
                    onChange={e => setConfig(p => ({ ...p, ctx_warning_threshold: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="65"
                    className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Handoff (%)</label>
                  <input
                    type="number"
                    min={50}
                    max={95}
                    value={config.ctx_handoff_threshold ?? ''}
                    onChange={e => setConfig(p => ({ ...p, ctx_handoff_threshold: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="80"
                    className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {agMessage && (
            <div className={`rounded-md px-3 py-2 text-xs ${agMessage.type === 'success' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
              {agMessage.text}
            </div>
          )}

          {backendChanged && (
            <div className="rounded-md border border-warning/30 bg-warning/15 px-3 py-2 text-xs text-warning">
              Cambiaste el backend, modelo, esfuerzo o política de contexto. Guarda y reinicia para que el daemon vuelva a leer <code>config.json</code>.
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => void saveAgConfig(true)}
              disabled={agSaving || restarting}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <IconDeviceFloppy size={14} />
              {agSaving || restarting ? 'Aplicando...' : 'Guardar y reiniciar'}
            </button>
            <button
              onClick={() => void saveAgConfig(false)}
              disabled={agSaving || restarting}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {agSaving ? 'Guardando...' : 'Guardar solamente'}
            </button>
            <button
              onClick={() => void restartAgent()}
              disabled={restarting || agSaving}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {restarting ? 'Reiniciando...' : 'Reiniciar agente'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
