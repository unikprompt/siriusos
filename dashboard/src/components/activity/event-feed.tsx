'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  IconMessage,
  IconCheckbox,
  IconShield,
  IconAlertTriangle,
  IconFlag,
  IconActivity,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { EmptyState } from '@/components/shared/empty-state';
import { useSSE } from '@/hooks/use-sse';
import type { Event, SSEEvent, EventType } from '@/lib/types';

// -- Icon mapping (color by event type, matches LiveActivity card) --

const eventTypeIcons: Record<string, React.ReactNode> = {
  message: <IconMessage size={16} className="text-primary" />,
  task: <IconCheckbox size={16} className="text-accent" />,
  approval: <IconShield size={16} className="text-warning" />,
  error: <IconAlertTriangle size={16} className="text-destructive" />,
  milestone: <IconFlag size={16} className="text-accent" />,
  heartbeat: <IconActivity size={16} className="text-success" />,
  action: <IconActivity size={16} className="text-muted-foreground" />,
};

const severityBg: Record<string, string> = {
  info: '',
  warning: 'bg-warning/5',
  error: 'bg-destructive/8 ring-1 ring-destructive/15',
};

function formatEventTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return 'unknown';
  }
}

// -- Types --

export interface EventFeedFilters {
  types: EventType[];
  agent: string;
  org: string;
  from?: string;
  to?: string;
}

interface EventFeedProps {
  initialEvents: Event[];
  filters: EventFeedFilters;
}

// -- Component --

export function EventFeed({ initialEvents, filters }: EventFeedProps) {
  const [allEvents, setAllEvents] = useState<Event[]>(initialEvents);

  // SSE for live updates
  const { events: sseEvents, isConnected } = useSSE({
    bufferSize: 100,
    filter: useCallback(
      (sse: SSEEvent) => {
        // Apply type filter if any types are selected
        if (filters.types.length > 0) {
          const sseType = sse.type as EventType;
          if (!filters.types.includes(sseType)) return false;
        }
        // Apply agent filter
        if (filters.agent && (sse.data?.agent as string) !== filters.agent) {
          return false;
        }
        return true;
      },
      [filters.types, filters.agent],
    ),
  });

  // Merge SSE events into the list
  useEffect(() => {
    if (sseEvents.length === 0) return;

    const newEvents: Event[] = sseEvents.map((sse, i) => ({
      id: `sse-${sse.timestamp}-${i}`,
      timestamp: sse.timestamp,
      agent: (sse.data?.agent as string) ?? '',
      org: (sse.data?.org as string) ?? '',
      type: (sse.type as EventType) ?? 'action',
      category: (sse.data?.category as string) ?? '',
      severity: ((sse.data?.severity as string) ?? 'info') as Event['severity'],
      data: sse.data,
      message: (sse.data?.message as string) ?? sse.type ?? 'Event',
    }));

    setAllEvents((prev) => {
      const merged = [...newEvents, ...prev];
      const seen = new Set<string>();
      return merged
        .filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        })
        .slice(0, 200);
    });
  }, [sseEvents]);

  // Apply client-side filters to display
  const displayEvents = allEvents.filter((e) => {
    if (filters.types.length > 0 && !filters.types.includes(e.type)) return false;
    if (filters.agent && e.agent !== filters.agent) return false;
    if (filters.org && e.org !== filters.org) return false;
    if (filters.from && e.timestamp < filters.from) return false;
    if (filters.to && e.timestamp > filters.to) return false;
    return true;
  });

  return (
    <div className="space-y-1">
      {/* Connection indicator */}
      <div className="flex items-center gap-2 pb-2 text-xs">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ring-2 ${
            isConnected
              ? 'bg-success ring-success/30 animate-pulse shadow-[0_0_6px_var(--success)]'
              : 'bg-warning ring-warning/30'
          }`}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          {isConnected ? 'Live' : 'Reconnecting...'}
        </span>
        <span className="ml-auto font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {displayEvents.length} events
        </span>
      </div>

      {/* Event list */}
      {displayEvents.length === 0 ? (
        <EmptyState
          kind="silence"
          title="No events match"
          description="Adjust the filters above or wait for new activity. The connected stream will pick up new events as soon as they arrive."
        />
      ) : (
        displayEvents.map((event) => (
          <div
            key={event.id}
            className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all hover:bg-surface-2 hover:translate-x-0.5 animate-event-in ${
              severityBg[event.severity] ?? ''
            }`}
          >
            {/* Timestamp */}
            <span className="shrink-0 w-[7rem] pt-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground/80" suppressHydrationWarning>
              {formatEventTime(event.timestamp)}
            </span>

            {/* Agent avatar */}
            <AgentAvatar name={event.agent || '?'} size="sm" />

            {/* Event type icon */}
            <span className="shrink-0 mt-0.5">
              {eventTypeIcons[event.type] ?? <IconActivity size={16} className="text-muted-foreground" />}
            </span>

            {/* Message */}
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug text-foreground/90">
                {event.message ?? event.category ?? event.type}
              </p>
              {event.agent && (
                <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                  {event.agent}
                  {event.org ? ` · ${event.org}` : ''}
                </p>
              )}
            </div>

            {/* Type badge */}
            <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/15">
              {event.type}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
