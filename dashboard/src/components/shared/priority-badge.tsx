'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';
import type { TaskPriority } from '@/lib/types';

export interface PriorityBadgeProps {
  priority: TaskPriority;
  className?: string;
}

const variantByPriority: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  urgent: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'outline',
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const t = useT();
  const variant = variantByPriority[priority] ?? 'secondary';
  const labelMap: Record<string, string> = {
    critical: t.badges.priority.critical,
    urgent: t.badges.priority.urgent,
    high: t.badges.priority.high,
    normal: t.badges.priority.normal,
    low: t.badges.priority.low,
  };
  const label = labelMap[priority] ?? t.badges.priority.normal;

  return (
    <Badge variant={variant} className={cn(className)}>
      {label}
    </Badge>
  );
}
