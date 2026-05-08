'use client';

import { Card } from '@/components/ui/card';
import { TimeAgo } from '@/components/shared';
import { EmptyState } from '@/components/shared/empty-state';
import { IconArrowRight } from '@tabler/icons-react';
import { useT } from '@/lib/i18n';

interface BusMessage {
  id: string;
  from: string;
  to: string;
  priority: string;
  timestamp: string;
  text: string;
  reply_to: string | null;
}

interface MessageFeedProps {
  messages: BusMessage[];
  onAgentClick?: (agent: string) => void;
  onMessageClick?: (pair: string) => void;
}

function AgentChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary ring-1 ring-primary/20">
        {name.charAt(0)}
      </span>
      <span className="font-mono text-[12px] font-medium text-foreground">{name}</span>
    </span>
  );
}

export function MessageFeed({ messages, onMessageClick }: MessageFeedProps) {
  const t = useT();
  if (messages.length === 0) {
    return (
      <EmptyState
        kind="silence"
        title={t.pages.comms.noMessagesYet}
        description={t.pages.comms.noMessagesYetDescription}
      />
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((msg) => (
        <Card
          key={msg.id}
          className="group cursor-pointer p-4 transition-all hover:bg-surface-2 hover:border-primary/30"
          onClick={() => {
            const pair = [msg.from.toLowerCase(), msg.to.toLowerCase()].sort().join('--');
            onMessageClick?.(pair);
          }}
        >
          <div className="mb-2 flex items-center gap-2 flex-wrap">
            <AgentChip name={msg.from} />
            <IconArrowRight size={12} className="shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
            <AgentChip name={msg.to} />
            {msg.priority === 'urgent' && (
              <span className="inline-flex h-5 items-center rounded-full bg-destructive/15 px-2 text-[10px] font-semibold uppercase tracking-wide text-destructive ring-1 ring-destructive/30">
                {t.pages.comms.urgent}
              </span>
            )}
            <TimeAgo
              date={msg.timestamp}
              className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground/80"
            />
          </div>
          <p className="text-sm text-foreground/85 whitespace-pre-wrap break-words line-clamp-3">{msg.text}</p>
        </Card>
      ))}
    </div>
  );
}
