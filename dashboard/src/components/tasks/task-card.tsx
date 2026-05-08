'use client';

import { Card } from '@/components/ui/card';
import { PriorityBadge, OrgBadge, TimeAgo } from '@/components/shared';
import { useT } from '@/lib/i18n';
import type { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const t = useT();
  return (
    <Card
      className="cursor-pointer p-3 transition-colors hover:bg-muted/50"
      onClick={() => onClick?.(task)}
    >
      <div className="space-y-2">
        <p className="text-sm font-medium leading-snug line-clamp-2">
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          <OrgBadge org={task.org} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {task.assignee ? (
            <span className="truncate max-w-[120px]">{task.assignee}</span>
          ) : (
            <span className="italic">{t.pages.tasks.unassigned}</span>
          )}
          <TimeAgo date={task.created_at} className="text-xs" />
        </div>
      </div>
    </Card>
  );
}
