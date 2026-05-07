'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgentCard, type AgentCardData } from './agent-card';
import { AddAgentCard } from './add-agent-card';
import { CreateAgentDialog } from './create-agent-dialog';
import { HealthDot } from '@/components/shared/health-dot';
import { EmptyState } from '@/components/shared/empty-state';
import { useSSE } from '@/hooks/use-sse';
import type { HealthStatus, SSEEvent } from '@/lib/types';

interface AgentsGridProps {
  initialAgents: AgentCardData[];
}

export function AgentsGrid({ initialAgents }: AgentsGridProps) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentCardData[]>(initialAgents);
  const [createOpen, setCreateOpen] = useState(false);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.type !== 'heartbeat') return;
    const agentName = event.data?.agent as string | undefined;
    if (!agentName) return;

    setAgents((prev) =>
      prev.map((a) => {
        if (a.systemName !== agentName && a.name !== agentName) return a;
        const health = (event.data?.health as HealthStatus) ?? a.health;
        const currentTask =
          (event.data?.current_task as string) ?? a.currentTask;
        return { ...a, health, currentTask };
      }),
    );
  }, []);

  useSSE({
    filter: (e) => e.type === 'heartbeat',
    onEvent: handleSSEEvent,
    bufferSize: 10,
  });

  return (
    <div className="space-y-4">
      {/* Health summary row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <HealthDot status="healthy" />
          {agents.filter((a) => a.health === 'healthy').length} healthy
        </span>
        <span className="flex items-center gap-1.5">
          <HealthDot status="stale" />
          {agents.filter((a) => a.health === 'stale').length} stale
        </span>
        <span className="flex items-center gap-1.5">
          <HealthDot status="down" />
          {agents.filter((a) => a.health === 'down').length} down
        </span>
      </div>

      {/* Grid */}
      {agents.length === 0 ? (
        <EmptyState
          kind="constellation"
          title="No agents in your fleet yet"
          description="Spin up your first agent and Sirius starts orchestrating. Each agent runs persistently in its own session."
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:opacity-90"
            >
              + Add your first agent
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-stagger>
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
          <AddAgentCard onClick={() => setCreateOpen(true)} />
        </div>
      )}

      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
