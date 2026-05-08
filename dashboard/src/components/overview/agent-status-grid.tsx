'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthDot } from '@/components/shared/health-dot';
import { IconRobot, IconChevronRight } from '@tabler/icons-react';
import { useT } from '@/lib/i18n';
import type { AgentSummary, Heartbeat } from '@/lib/types';

interface AgentStatusGridProps {
  agents: (AgentSummary & { emoji?: string })[];
  heartbeats: Record<string, Heartbeat>;
}

export function AgentStatusGrid({ agents, heartbeats }: AgentStatusGridProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <IconRobot size={16} className="text-muted-foreground" />
          {t.pages.overview.agentFleet}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 pt-0" data-stagger>
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 64 64"
              className="text-muted-foreground/40"
              aria-hidden="true"
            >
              <path
                d="M 32 4 L 34 30 L 60 32 L 34 34 L 32 60 L 30 34 L 4 32 L 30 30 Z"
                fill="currentColor"
              />
            </svg>
            <p className="text-xs text-muted-foreground">{t.pages.overview.noAgentsDiscovered}</p>
          </div>
        ) : (
          agents.map((agent) => {
            const hb = heartbeats[agent.name];
            const currentTask = hb?.current_task || '';
            const taskPreview = currentTask
              .replace(/^WORKING ON:\s*/i, '')
              .slice(0, 60);

            return (
              <Link
                key={agent.name}
                href={`/agents/${encodeURIComponent(agent.name)}`}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-all hover:bg-surface-2 hover:translate-x-0.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm ring-1 ring-primary/15 transition-all group-hover:ring-primary/25">
                  {agent.emoji || agent.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {agent.name}
                    </span>
                    <HealthDot status={agent.health} />
                  </div>
                  {taskPreview && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {taskPreview}
                    </p>
                  )}
                </div>
                <IconChevronRight
                  size={14}
                  className="shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
