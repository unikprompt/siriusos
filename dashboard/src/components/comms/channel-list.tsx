'use client';

import { TimeAgo } from '@/components/shared';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface Channel {
  pair: string;
  agents: [string, string];
  last_message: { text: string; timestamp: string; from: string };
  message_count: number;
  last_activity: string;
  archived: boolean;
}

interface ChannelListProps {
  channels: Channel[];
  selectedPair: string | null;
  onChannelClick: (pair: string) => void;
}

function PairAvatar({ a, b }: { a: string; b: string }) {
  return (
    <div className="relative flex h-9 w-12 shrink-0 items-center">
      <span className="absolute left-0 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold uppercase text-primary ring-2 ring-card">
        {a.charAt(0)}
      </span>
      <span className="absolute left-5 flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold uppercase text-accent ring-2 ring-card">
        {b.charAt(0)}
      </span>
    </div>
  );
}

export function ChannelList({ channels, selectedPair, onChannelClick }: ChannelListProps) {
  const t = useT();
  if (channels.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">{t.pages.comms.noChannels}</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {channels.map((ch) => {
        const selected = selectedPair === ch.pair;
        return (
          <button
            type="button"
            key={ch.pair}
            onClick={() => onChannelClick(ch.pair)}
            className={cn(
              'group w-full rounded-lg border p-2.5 text-left transition-all duration-150',
              'hover:-translate-y-px',
              selected
                ? 'border-primary/40 bg-primary/8 shadow-[0_0_0_1px_var(--primary)/15,0_4px_16px_-4px_rgba(61,111,229,0.2)] dark:shadow-[0_0_0_1px_var(--primary)/15,0_4px_16px_-4px_rgba(165,201,255,0.18)]'
                : 'border-border bg-card hover:border-primary/25 hover:bg-surface-2',
              ch.archived && 'opacity-55',
            )}
          >
            <div className="flex items-start gap-3">
              <PairAvatar a={ch.agents[0]} b={ch.agents[1]} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-[12px] font-medium text-foreground">
                    {ch.agents[0]} <span className="text-muted-foreground/60">·</span> {ch.agents[1]}
                  </p>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground">
                    {ch.message_count}
                  </span>
                </div>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  <span className="font-medium text-foreground/70">{ch.last_message.from}:</span>{' '}
                  {ch.last_message.text}
                </p>
                <div className="flex items-center justify-between">
                  <TimeAgo date={ch.last_activity} className="font-mono text-[10px] text-muted-foreground/70" />
                  {ch.archived && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      {t.pages.comms.archived}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
