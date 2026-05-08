'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';
import type { TaskStatus } from '@/lib/types';

export interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

const variantByStatus: Record<TaskStatus, { variant: 'outline' | 'default' | 'destructive' | 'secondary'; className?: string }> = {
  pending: { variant: 'outline' },
  in_progress: { variant: 'default' },
  blocked: { variant: 'destructive' },
  completed: { variant: 'secondary', className: 'bg-success/10 text-success' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useT();
  const config = variantByStatus[status] ?? { variant: 'outline' as const };
  const labelMap = {
    pending: t.badges.status.pending,
    in_progress: t.badges.status.inProgress,
    blocked: t.badges.status.blocked,
    completed: t.badges.status.completed,
  } as const;
  const label = labelMap[status] ?? t.badges.status.unknown;

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {label}
    </Badge>
  );
}
