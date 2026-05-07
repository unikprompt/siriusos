'use client';

import { useRouter } from 'next/navigation';
import {
  IconRobot,
  IconChecklist,
  IconShieldCheck,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: number | string;
  sublabel?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  href?: string;
}

function MetricCard({ label, value, sublabel, icon, href }: MetricCardProps) {
  const router = useRouter();
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-200",
        "hover:border-primary/40 hover:-translate-y-px",
        "hover:shadow-[0_8px_24px_-4px_rgba(165,201,255,0.12),0_0_0_1px_rgba(165,201,255,0.06)]",
        href && "cursor-pointer"
      )}
      onClick={href ? () => router.push(href) : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 font-[family-name:var(--font-display)] text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          {sublabel && (
            <p className="mt-2 text-[11px] text-muted-foreground">{sublabel}</p>
          )}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all group-hover:bg-primary/15 group-hover:ring-primary/30">
          {icon}
        </div>
      </div>
    </div>
  );
}

interface MetricCardsProps {
  agentsOnline: number;
  agentsTotal: number;
  tasksCompleted: number;
  tasksInProgress: number;
  tasksPending: number;
  pendingApprovals: number;
  blockedTasks: number;
}

export function MetricCards({
  agentsOnline,
  agentsTotal,
  tasksCompleted,
  tasksInProgress,
  tasksPending,
  pendingApprovals,
  blockedTasks,
}: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard
        label="Agents Online"
        value={`${agentsOnline}/${agentsTotal}`}
        sublabel={agentsOnline === agentsTotal ? 'All systems go' : `${agentsTotal - agentsOnline} offline`}
        icon={<IconRobot size={18} className="text-primary" />}
        href="/agents"
      />
      <MetricCard
        label="Tasks Today"
        value={tasksCompleted}
        sublabel={`${tasksInProgress} active, ${tasksPending} queued`}
        icon={<IconChecklist size={18} className="text-primary" />}
        href="/tasks"
      />
      <MetricCard
        label="Approvals"
        value={pendingApprovals}
        sublabel={pendingApprovals === 0 ? 'Queue clear' : 'Awaiting review'}
        icon={<IconShieldCheck size={18} className="text-primary" />}
        href="/approvals"
      />
      <MetricCard
        label="Blocked"
        value={blockedTasks}
        sublabel={blockedTasks === 0 ? 'No blockers' : 'Needs attention'}
        icon={<IconAlertTriangle size={18} className="text-primary" />}
        href="/tasks?status=blocked"
      />
    </div>
  );
}
