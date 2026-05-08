'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es as dfnsEs, enUS as dfnsEn } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface TimeAgoProps {
  date: string | Date;
  className?: string;
}

function formatRelative(date: string | Date, dfnsLocale: typeof dfnsEs | typeof dfnsEn): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    return formatDistanceToNow(d, { addSuffix: true, locale: dfnsLocale });
  } catch {
    return '—';
  }
}

function formatAbsolute(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid date';
    return d.toISOString();
  } catch {
    return 'Invalid date';
  }
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  const { locale } = useLocale();
  const dfnsLocale = locale === 'es' ? dfnsEs : dfnsEn;
  const [relative, setRelative] = useState(() => formatRelative(date, dfnsLocale));

  useEffect(() => {
    setRelative(formatRelative(date, dfnsLocale));
    const interval = setInterval(() => {
      setRelative(formatRelative(date, dfnsLocale));
    }, 60_000);
    return () => clearInterval(interval);
  }, [date, dfnsLocale]);

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn('text-sm text-muted-foreground', className)}
        suppressHydrationWarning
      >
        {relative}
      </TooltipTrigger>
      <TooltipContent>{formatAbsolute(date)}</TooltipContent>
    </Tooltip>
  );
}
