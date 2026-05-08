'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconX } from '@tabler/icons-react';
import { useT } from '@/lib/i18n';
import type { EventType } from '@/lib/types';
import type { EventFeedFilters } from './event-feed';

const EVENT_TYPE_KEYS: EventType[] = [
  'message', 'task', 'approval', 'error', 'milestone', 'heartbeat', 'action',
];

interface ActivityFiltersProps {
  filters: EventFeedFilters;
  onFiltersChange: (filters: EventFeedFilters) => void;
  agents: string[];
  orgs: string[];
}

export function ActivityFilters({
  filters,
  onFiltersChange,
  agents,
  orgs,
}: ActivityFiltersProps) {
  const t = useT();
  const toggleType = (type: EventType) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    onFiltersChange({ ...filters, types });
  };

  const hasActive =
    filters.types.length > 0 ||
    filters.agent !== '' ||
    filters.org !== '' ||
    filters.from !== undefined ||
    filters.to !== undefined;

  const clearAll = () => {
    onFiltersChange({
      types: [],
      agent: '',
      org: '',
      from: undefined,
      to: undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Type checkboxes */}
      <div>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t.pages.activity.eventTypesLabel}
        </span>
        <div className="flex flex-wrap gap-3 mt-2">
          {EVENT_TYPE_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={filters.types.includes(key)}
                onCheckedChange={() => toggleType(key)}
              />
              <Label className="text-sm cursor-pointer">{t.pages.activity.eventTypes[key]}</Label>
            </label>
          ))}
        </div>
      </div>

      {/* Agent + Org + Date range */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">{t.pages.activity.filterAgent}</Label>
          <Select
            value={filters.agent || 'all'}
            onValueChange={(v) =>
              onFiltersChange({ ...filters, agent: v === 'all' ? '' : (v ?? '') })
            }
          >
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder={t.pages.activity.allAgents} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.pages.activity.allAgents}</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">{t.pages.activity.filterOrg}</Label>
          <Select
            value={filters.org || 'all'}
            onValueChange={(v) =>
              onFiltersChange({ ...filters, org: v === 'all' ? '' : (v ?? '') })
            }
          >
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder={t.pages.activity.allOrgs} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.pages.activity.allOrgs}</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">{t.pages.activity.filterFrom}</Label>
          <Input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                from: e.target.value || undefined,
              })
            }
            className="h-8 w-[140px] text-xs"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">{t.pages.activity.filterTo}</Label>
          <Input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                to: e.target.value || undefined,
              })
            }
            className="h-8 w-[140px] text-xs"
          />
        </div>

        {hasActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-8 gap-1 text-xs text-muted-foreground"
          >
            <IconX className="size-3" />
            {t.pages.activity.clear}
          </Button>
        )}
      </div>
    </div>
  );
}
