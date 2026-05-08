'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BottleneckEditor } from './bottleneck-editor';
import { GoalProgressList } from './goal-progress-list';
import { useT } from '@/lib/i18n';
import type { Goal } from '@/lib/types';

interface CurrentFocusProps {
  org: string;
  bottleneck: string;
  goals: Goal[];
}

export function CurrentFocus({ org, bottleneck, goals }: CurrentFocusProps) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t.pages.overview.currentFocus}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <BottleneckEditor org={org} initialValue={bottleneck} />
        <GoalProgressList goals={goals} />
      </CardContent>
    </Card>
  );
}
