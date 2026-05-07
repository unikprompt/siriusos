'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EventFeed, type EventFeedFilters } from '@/components/activity/event-feed';
import { ActivityFilters } from '@/components/activity/activity-filters';
import type { Event } from '@/lib/types';

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
  const [filters, setFilters] = useState<EventFeedFilters>({
    types: [],
    agent: '',
    org: '',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Activity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time event stream from across the fleet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Filters
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
