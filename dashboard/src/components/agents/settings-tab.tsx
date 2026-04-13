'use client';

import { useState, useEffect } from 'react';
import { IconDeviceFloppy, IconSettings } from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type Provider = 'anthropic' | 'openai';

const MODELS_BY_PROVIDER: Record<Provider, string[]> = {
  anthropic: [
    'claude-opus-4-6',
    'claude-opus-4-6[1m]',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
  ],
  openai: [
    'gpt-5.4',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex',
  ],
};

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.4',
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
  model?: string;
  max_session_seconds?: number;
  max_crashes_per_day?: number;
  startup_delay?: number;
}

interface SettingsTabProps {
  agentName: string;
}

const APPROVAL_CATEGORIES = ['external-comms', 'financial', 'deployment', 'data-deletion'] as const;

type MessageState = { type: 'success' | 'error'; text: string } | null;

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
  const [initialProvider, setInitialProvider] = useState<Provider>('anthropic');
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/agents/${encodeURIComponent(agentName)}/config`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        if (!controller.signal.aborted && d.config) {
          setConfig(d.config);
          setInitialProvider((d.config.provider as Provider) || 'anthropic');
        }
        if (!controller.signal.aborted) setLoading(false);
      })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false); });
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
  ) => {
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
        setMessage({ type: 'error', text: d.error || 'Failed to save' });
      } else {
        if (d.config) setConfig(d.config);
        setMessage({ type: 'success', text: 'Saved. Agent notified to reload config.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
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

  const saveAgConfig = () =>
    saveSection(
      {
        provider: config.provider,
        model: config.model,
        max_session_seconds: config.max_session_seconds,
        max_crashes_per_day: config.max_crashes_per_day,
        startup_delay: config.startup_delay,
      },
      setAgSaving,
      setAgMessage,
    );

  const restartAgent = async () => {
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
        setAgMessage({ type: 'error', text: d.error || 'Restart failed' });
      } else {
        setAgMessage({ type: 'success', text: 'Agent restarted. New backend now active.' });
        setInitialProvider((config.provider as Provider) || 'anthropic');
      }
    } catch {
      setAgMessage({ type: 'error', text: 'Network error during restart' });
    } finally {
      setRestarting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }

  const alwaysAsk = config.approval_rules?.always_ask || [];
  const neverAsk = config.approval_rules?.never_ask || [];

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
                className={`mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none${startError ? ' border-red-500' : ''}`}
              />
              {startError && <p className="mt-1 text-xs text-red-500">{startError}</p>}
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
                className={`mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none${endError ? ' border-red-500' : ''}`}
              />
              {endError && <p className="mt-1 text-xs text-red-500">{endError}</p>}
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
            <div className={`rounded-md px-3 py-2 text-xs ${opMessage.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
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
                  const knownModels = MODELS_BY_PROVIDER[nextProvider];
                  const currentModel = p.model || '';
                  const keepModel = knownModels.includes(currentModel);
                  return {
                    ...p,
                    provider: nextProvider,
                    model: keepModel ? currentModel : DEFAULT_MODEL[nextProvider],
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
                ? 'Uses your ChatGPT Plus subscription via `codex login`. Requires codex CLI installed.'
                : 'Uses your Anthropic subscription via `claude` CLI (default).'}
            </p>
          </div>

          {(() => {
            const provider: Provider = config.provider || 'anthropic';
            const knownModels = MODELS_BY_PROVIDER[provider];
            const currentModel = config.model || '';
            const isCustom = currentModel !== '' && !knownModels.includes(currentModel);
            const selectValue = isCustom ? '__custom__' : currentModel || DEFAULT_MODEL[provider];
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
                      setConfig(p => ({ ...p, model: v }));
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

          {agMessage && (
            <div className={`rounded-md px-3 py-2 text-xs ${agMessage.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
              {agMessage.text}
            </div>
          )}

          {(config.provider || 'anthropic') !== initialProvider && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              Provider changed from <strong>{initialProvider}</strong> to <strong>{config.provider || 'anthropic'}</strong>. Save and restart the agent for the change to take effect.
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={saveAgConfig}
              disabled={agSaving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <IconDeviceFloppy size={14} />
              {agSaving ? 'Saving...' : 'Save Agent Config'}
            </button>
            <button
              onClick={restartAgent}
              disabled={restarting || agSaving}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {restarting ? 'Restarting...' : 'Restart Agent'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
