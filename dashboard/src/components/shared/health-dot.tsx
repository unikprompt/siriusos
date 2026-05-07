import { cn } from '@/lib/utils';
import type { HealthStatus } from '@/lib/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface HealthDotProps {
  status: HealthStatus;
  showLabel?: boolean;
  className?: string;
}

interface DotStyle {
  color: string;
  label: string;
  ring: string;
  glow: string;
}

const statusConfig: Record<HealthStatus, DotStyle> = {
  healthy: {
    color: 'bg-success',
    label: 'Healthy',
    ring: 'ring-success/30',
    glow: 'shadow-[0_0_8px_2px_var(--success)]',
  },
  stale: {
    color: 'bg-warning',
    label: 'Stale',
    ring: 'ring-warning/30',
    glow: 'shadow-[0_0_6px_1px_var(--warning)]',
  },
  down: {
    color: 'bg-destructive opacity-70',
    label: 'Down',
    ring: 'ring-destructive/20',
    glow: '',
  },
};

export function HealthDot({ status, showLabel = false, className }: HealthDotProps) {
  const config = statusConfig[status];

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn('inline-flex items-center gap-1.5', className)}
      >
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full ring-2 transition-all',
            config.color,
            config.ring,
            config.glow,
            status === 'healthy' && 'animate-pulse-dot'
          )}
        />
        {showLabel && (
          <span className="text-xs text-muted-foreground">{config.label}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{config.label}</TooltipContent>
    </Tooltip>
  );
}
