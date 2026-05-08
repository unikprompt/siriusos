'use client';

import { FilterBar } from '@/components/shared';
import type { FilterConfig } from '@/components/shared';
import { useT } from '@/lib/i18n';

interface TaskFiltersProps {
  orgs: string[];
  agents: string[];
  projects: string[];
  filters: {
    org: string;
    agent: string;
    priority: string;
    project: string;
    status: string;
  };
  onChange: (key: string, value: string) => void;
  onClearAll: () => void;
}

export function TaskFilters({
  orgs,
  agents,
  projects,
  filters,
  onChange,
  onClearAll,
}: TaskFiltersProps) {
  const t = useT();
  const filterConfigs: FilterConfig[] = [
    {
      key: 'org',
      label: t.pages.tasks.filters.org,
      value: filters.org,
      onChange: (v) => onChange('org', v),
      options: [
        { value: 'all', label: t.pages.tasks.filters.allOrgs },
        ...orgs.map((o) => ({ value: o, label: o })),
      ],
    },
    {
      key: 'agent',
      label: t.pages.tasks.filters.agent,
      value: filters.agent,
      onChange: (v) => onChange('agent', v),
      options: [
        { value: 'all', label: t.pages.tasks.filters.allAgents },
        ...agents.map((a) => ({ value: a, label: a })),
      ],
    },
    {
      key: 'priority',
      label: t.pages.tasks.filters.priority,
      value: filters.priority,
      onChange: (v) => onChange('priority', v),
      options: [
        { value: 'all', label: t.pages.tasks.filters.allPriorities },
        { value: 'urgent', label: t.badges.priority.urgent },
        { value: 'high', label: t.badges.priority.high },
        { value: 'normal', label: t.badges.priority.normal },
        { value: 'low', label: t.badges.priority.low },
      ],
    },
    {
      key: 'status',
      label: t.pages.tasks.filters.status,
      value: filters.status,
      onChange: (v) => onChange('status', v),
      options: [
        { value: 'all', label: t.pages.tasks.filters.allStatuses },
        { value: 'pending', label: t.badges.status.pending },
        { value: 'in_progress', label: t.badges.status.inProgress },
        { value: 'blocked', label: t.badges.status.blocked },
        { value: 'completed', label: t.badges.status.completed },
      ],
    },
  ];

  if (projects.length > 0) {
    filterConfigs.push({
      key: 'project',
      label: t.pages.tasks.filters.project,
      value: filters.project,
      onChange: (v) => onChange('project', v),
      options: [
        { value: 'all', label: t.pages.tasks.filters.allProjects },
        ...projects.map((p) => ({ value: p, label: p })),
      ],
    });
  }

  return <FilterBar filters={filterConfigs} onClearAll={onClearAll} />;
}
