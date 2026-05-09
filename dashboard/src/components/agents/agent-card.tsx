'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { HealthDot } from '@/components/shared/health-dot';
import { OrgBadge } from '@/components/shared/org-badge';
import { RuntimeBadge } from '@/components/shared/runtime-badge';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { AgentActions } from './agent-actions';
import { IconChecklist } from '@tabler/icons-react';
import { useT, format } from '@/lib/i18n';
import type { AgentRuntime, HealthStatus } from '@/lib/types';

export interface AgentCardData {
  name: string;
  /** Filesystem / config key (e.g. "devbot"). Used for URL routing. */
  systemName: string;
  org: string;
  emoji: string;
  role: string;
  health: HealthStatus;
  currentTask?: string;
  tasksToday: number;
  runtime?: AgentRuntime;
}

interface AgentCardProps {
  agent: AgentCardData;
}

export function AgentCard({ agent }: AgentCardProps) {
  const t = useT();
  const router = useRouter();

  const healthLabel =
    agent.health === 'healthy' ? t.pages.agents.health.online :
    agent.health === 'stale' ? t.badges.status.unknown : t.pages.agents.health.offline;

  return (
    <Link href={`/agents/${encodeURIComponent(agent.systemName)}`}>
      <Card className="group relative h-full cursor-pointer transition-all hover:shadow-md hover:border-primary/20">
        <CardContent className="space-y-3">
          {/* Header: avatar + name + health */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <AgentAvatar name={agent.name} emoji={agent.emoji} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold leading-tight">{agent.name}</p>
                  <HealthDot status={agent.health} />
                </div>
                {agent.systemName && agent.systemName !== agent.name && (
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                    {agent.systemName}
                  </p>
                )}
                {agent.role && (
                  <p className="text-[11px] text-muted-foreground truncate max-w-[180px] mt-0.5">
                    {agent.role}
                  </p>
                )}
              </div>
            </div>
            <AgentActions
              agentName={agent.systemName}
              org={agent.org}
              health={agent.health}
              onAction={() => router.refresh()}
            />
          </div>

          {/* Org + runtime badges */}
          <div className="flex items-center gap-1.5">
            {agent.org && <OrgBadge org={agent.org} />}
            {agent.runtime && <RuntimeBadge runtime={agent.runtime} />}
          </div>

          {/* Current task */}
          {agent.currentTask ? (
            <div className="rounded-md bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground mb-0.5">{t.pages.agents.card.workingOn}</p>
              <p className="text-xs leading-snug line-clamp-2">
                {agent.currentTask.replace(/^WORKING ON:\s*/i, '')}
              </p>
            </div>
          ) : (
            <div className="rounded-md bg-muted/20 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">
                {agent.health === 'healthy' ? t.pages.agents.card.idle : healthLabel}
              </p>
            </div>
          )}

          {/* Footer: tasks count */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconChecklist size={13} />
            <span>
              {format(agent.tasksToday === 1 ? t.pages.agents.card.tasksTodayOne : t.pages.agents.card.tasksTodayMany, { count: agent.tasksToday })}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
