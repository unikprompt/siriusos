'use client';

/**
 * /workflows/health — Fleet Health Dashboard (Subtask 4.4)
 *
 * Dedicated deep-dive view showing health state for every cron across all agents.
 *
 * Layout:
 *  1. 4 stat cards (Total / Healthy / Warning / Failure + Never-Fired)
 *  2. Per-agent grouped sections, sorted: warning+failure first within each agent
 *  3. Each cron row links to /workflows/[agent]/[name] detail page
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconArrowLeft,
  IconRefresh,
  IconRobot,
  IconClock,
  IconExternalLink,
  IconCircleCheck,
  IconAlertTriangle,
  IconCircleX,
  IconCircleDashed,
  IconShieldCheck,
} from '@tabler/icons-react';
import { formatRelative } from '@/lib/cron-utils';
import { EmptyState } from '@/components/shared/empty-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthState = 'healthy' | 'warning' | 'failure' | 'never-fired';

interface CronHealthRow {
  agent: string;
  org: string;
  cronName: string;
  state: HealthState;
  reason: string;
  lastFire: number | null;
  expectedIntervalMs: number;
  gapMs: number | null;
  successRate24h: number;
  firesLast24h: number;
  nextFire: string;
}

interface AgentHealthSummary {
  agent: string;
  org: string;
  total: number;
  healthy: number;
  warning: number;
  failure: number;
  neverFired: number;
}

interface FleetHealthResponse {
  rows: CronHealthRow[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    failure: number;
    neverFired: number;
    agents: Record<string, AgentHealthSummary>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_ORDER: Record<HealthState, number> = {
  failure: 0,
  warning: 1,
  'never-fired': 2,
  healthy: 3,
};

function stateColor(state: HealthState): string {
  switch (state) {
    case 'healthy':    return 'text-success';
    case 'warning':    return 'text-warning';
    case 'failure':    return 'text-destructive';
    case 'never-fired': return 'text-destructive';
  }
}

function stateBgColor(state: HealthState): string {
  switch (state) {
    case 'healthy':    return 'bg-success/15 border-success/30 text-success';
    case 'warning':    return 'bg-warning/15 border-warning/30 text-warning';
    case 'failure':    return 'bg-destructive/15 border-destructive/30 text-destructive';
    case 'never-fired': return 'bg-destructive/15 border-destructive/30 text-destructive';
  }
}

function StateIcon({ state, size = 14 }: { state: HealthState; size?: number }) {
  const cls = stateColor(state);
  switch (state) {
    case 'healthy':    return <IconCircleCheck size={size} className={cls} />;
    case 'warning':    return <IconAlertTriangle size={size} className={cls} />;
    case 'failure':    return <IconCircleX size={size} className={cls} />;
    case 'never-fired': return <IconCircleDashed size={size} className={cls} />;
  }
}

function StateBadge({ state }: { state: HealthState }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${stateBgColor(state)}`}>
      <StateIcon state={state} size={10} />
      {state === 'never-fired' ? 'never fired' : state}
    </span>
  );
}

function formatSuccessRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FleetHealthPage() {
  const router = useRouter();
  const [data, setData] = useState<FleetHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<HealthState | 'all'>('all');

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workflows/health');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const d: FleetHealthResponse = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchHealth(); }, [fetchHealth]);

  const summary = data?.summary;

  // Group rows by agent, applying state filter
  const filteredRows = (data?.rows ?? []).filter(
    r => stateFilter === 'all' || r.state === stateFilter
  );

  // Group by agent, sort rows within each agent: worst state first
  const agentGroups: Map<string, CronHealthRow[]> = new Map();
  for (const row of filteredRows) {
    if (!agentGroups.has(row.agent)) agentGroups.set(row.agent, []);
    agentGroups.get(row.agent)!.push(row);
  }
  for (const [, rows] of agentGroups) {
    rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
  }
  // Sort agents: those with worst states first
  const sortedAgents = [...agentGroups.entries()].sort(([, aRows], [, bRows]) => {
    const aWorst = Math.min(...aRows.map(r => STATE_ORDER[r.state]));
    const bWorst = Math.min(...bRows.map(r => STATE_ORDER[r.state]));
    return aWorst - bWorst;
  });

  const allHealthy = summary && summary.total > 0 &&
    summary.warning === 0 && summary.failure === 0 && summary.neverFired === 0;

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => router.push('/workflows')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconArrowLeft size={15} />
        Workflows
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fleet Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gap detection and health state for every cron across all agents
          </p>
        </div>
        <button
          onClick={fetchHealth}
          className="p-2 rounded-md hover:bg-muted transition-colors shrink-0"
          title="Refresh"
        >
          <IconRefresh size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-3xl font-semibold mt-1">
              {loading ? <span className="text-muted-foreground">-</span> : (summary?.total ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Healthy</p>
            <p className={`text-3xl font-semibold mt-1 ${!loading && summary ? 'text-success' : ''}`}>
              {loading ? <span className="text-muted-foreground">-</span> : (summary?.healthy ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Warning</p>
            <p className={`text-3xl font-semibold mt-1 ${!loading && (summary?.warning ?? 0) > 0 ? 'text-warning' : ''}`}>
              {loading ? <span className="text-muted-foreground">-</span> : (summary?.warning ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Failed / Never</p>
            <p className={`text-3xl font-semibold mt-1 ${!loading && ((summary?.failure ?? 0) + (summary?.neverFired ?? 0)) > 0 ? 'text-destructive' : ''}`}>
              {loading ? (
                <span className="text-muted-foreground">-</span>
              ) : (
                <>
                  {(summary?.failure ?? 0) + (summary?.neverFired ?? 0)}
                  {(summary?.neverFired ?? 0) > 0 && (
                    <span className="text-sm text-muted-foreground font-normal ml-1">
                      ({summary?.neverFired} new)
                    </span>
                  )}
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-3 text-sm text-destructive">
          Failed to load fleet health: {error}
        </div>
      )}

      {/* Filter pills */}
      {!loading && !error && summary && summary.total > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'healthy', 'warning', 'failure', 'never-fired'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStateFilter(f)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                stateFilter === f
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {f === 'all' ? `All (${summary.total})` :
               f === 'healthy' ? `Healthy (${summary.healthy})` :
               f === 'warning' ? `Warning (${summary.warning})` :
               f === 'failure' ? `Failure (${summary.failure})` :
               `Never fired (${summary.neverFired})`}
            </button>
          ))}
        </div>
      )}

      {/* All healthy empty state */}
      {!loading && !error && allHealthy && stateFilter === 'all' && (
        <Card>
          <EmptyState
            kind="orbit"
            title="All systems nominal"
            description="Every cron is firing on schedule. Nothing to see here, in the best way."
          />
        </Card>
      )}

      {/* No crons empty state */}
      {!loading && !error && summary?.total === 0 && (
        <Card>
          <EmptyState
            kind="orbit"
            title="No crons configured"
            description="Add a cron to any agent to start automating recurring work."
          />
        </Card>
      )}

      {/* Per-agent breakdown */}
      {!loading && !error && sortedAgents.length > 0 && (
        <div className="space-y-4">
          {sortedAgents.map(([agentName, rows]) => {
            const agentSummary = data?.summary.agents[agentName];
            const hasIssues = (agentSummary?.warning ?? 0) + (agentSummary?.failure ?? 0) + (agentSummary?.neverFired ?? 0) > 0;

            return (
              <Card key={agentName} className={hasIssues ? 'border-warning/30' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <IconRobot size={16} className="text-muted-foreground" />
                      <CardTitle className="text-base">{agentName}</CardTitle>
                      {agentSummary && (
                        <span className="text-xs text-muted-foreground">{agentSummary.org}</span>
                      )}
                    </div>
                    {agentSummary && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {agentSummary.healthy > 0 && (
                          <span className="text-success">
                            {agentSummary.healthy} healthy
                          </span>
                        )}
                        {agentSummary.warning > 0 && (
                          <span className="text-warning">
                            {agentSummary.warning} warning
                          </span>
                        )}
                        {agentSummary.failure > 0 && (
                          <span className="text-destructive">
                            {agentSummary.failure} failed
                          </span>
                        )}
                        {agentSummary.neverFired > 0 && (
                          <span className="text-destructive">
                            {agentSummary.neverFired} never fired
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Cron</th>
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">State</th>
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Gap</th>
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Success rate</th>
                          <th className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => (
                          <tr
                            key={row.cronName}
                            className="border-b last:border-0 group hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => router.push(`/workflows/${encodeURIComponent(agentName)}/${encodeURIComponent(row.cronName)}`)}
                          >
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-1.5">
                                <IconClock size={12} className="text-muted-foreground shrink-0" />
                                <span className="font-medium">{row.cronName}</span>
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  title="Open detail page"
                                  onClick={e => {
                                    e.stopPropagation();
                                    router.push(`/workflows/${encodeURIComponent(agentName)}/${encodeURIComponent(row.cronName)}`);
                                  }}
                                >
                                  <IconExternalLink size={11} />
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 pr-4">
                              <StateBadge state={row.state} />
                            </td>
                            <td className="py-2.5 pr-4 text-xs text-muted-foreground hidden sm:table-cell">
                              {row.lastFire
                                ? formatRelative(new Date(row.lastFire).toISOString())
                                : <span className="text-muted-foreground/50">—</span>}
                            </td>
                            <td className="py-2.5 pr-4 text-xs text-muted-foreground hidden md:table-cell">
                              {row.firesLast24h > 0 ? (
                                <span className={row.successRate24h < 0.8 ? 'text-warning' : ''}>
                                  {formatSuccessRate(row.successRate24h)} ({row.firesLast24h} fires)
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">no data</span>
                              )}
                            </td>
                            <td className="py-2.5 text-xs text-muted-foreground max-w-[280px]">
                              <span className="line-clamp-1" title={row.reason}>{row.reason}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filter produces no results */}
      {!loading && !error && stateFilter !== 'all' && filteredRows.length === 0 && summary && summary.total > 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-sm text-muted-foreground">
              No crons match the <strong>{stateFilter}</strong> filter.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setStateFilter('all')}>
              Clear filter
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
