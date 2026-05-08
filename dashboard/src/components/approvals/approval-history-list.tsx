'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CategoryBadge, OrgBadge, TimeAgo } from '@/components/shared';
import { FilterBar } from '@/components/shared';
import { useT } from '@/lib/i18n';
import type { Approval } from '@/lib/types';
import type { FilterConfig } from '@/components/shared';

interface ApprovalHistoryListProps {
  approvals: Approval[];
  agents: string[];
  categories: string[];
  filters: {
    agent: string;
    category: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  onApprovalClick: (approval: Approval) => void;
}

export function ApprovalHistoryList({
  approvals,
  agents,
  categories,
  filters,
  onFilterChange,
  onClearFilters,
  onApprovalClick,
}: ApprovalHistoryListProps) {
  const t = useT();
  const filterConfigs: FilterConfig[] = [
    {
      key: 'agent',
      label: t.pages.approvals.historyFilters.agent,
      value: filters.agent,
      onChange: (v) => onFilterChange('agent', v),
      options: [
        { value: 'all', label: t.pages.approvals.historyFilters.allAgents },
        ...agents.map((a) => ({ value: a, label: a })),
      ],
    },
    {
      key: 'category',
      label: t.pages.approvals.historyFilters.category,
      value: filters.category,
      onChange: (v) => onFilterChange('category', v),
      options: [
        { value: 'all', label: t.pages.approvals.historyFilters.allCategories },
        ...categories.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar filters={filterConfigs} onClearAll={onClearFilters} />

      {approvals.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t.pages.approvals.empty.history}
        </p>
      ) : (
        <div className="grid gap-2">
          {approvals.map((approval) => (
            <Card
              key={approval.id}
              className="cursor-pointer p-4 transition-colors hover:bg-muted/50"
              onClick={() => onApprovalClick(approval)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium truncate">{approval.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={approval.category} />
                    <OrgBadge org={approval.org} />
                    <span className="text-xs text-muted-foreground">
                      {t.pages.approvals.historyBy} {approval.agent}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    variant={approval.status === 'approved' ? 'default' : 'destructive'}
                  >
                    {approval.status === 'approved' ? t.pages.approvals.detail.approved : t.pages.approvals.detail.rejected}
                  </Badge>
                  {approval.resolved_at && (
                    <TimeAgo date={approval.resolved_at} className="text-xs" />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
