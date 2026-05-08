'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EventFeed, type EventFeedFilters } from '@/components/activity/event-feed';
import { ActivityFilters } from '@/components/activity/activity-filters';
import type { Event } from '@/lib/types';
import { useT } from '@/lib/i18n';

interface ActivityPageClientProps {
  initialEvents: Event[];
  agents: string[];
  orgs: string[];
}

export function ActivityPageClient({
  initialEvents,
  agents,
  orgs,
}: ActivityPageClientProps) {
  const t = useT();
  const [filters, setFilters] = useState<EventFeedFilters>({
    types: [],
    agent: '',
    org: '',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          {t.pages.activity.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.pages.activity.subtitle}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {t.pages.activity.filters}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFilters
            filters={filters}
            onFiltersChange={setFilters}
            agents={agents}
            orgs={orgs}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <EventFeed initialEvents={initialEvents} filters={filters} />
        </CardContent>
      </Card>
    </div>
  );
}
