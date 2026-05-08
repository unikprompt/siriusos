'use client';

import { useT, format } from '@/lib/i18n';

interface AgentsHeaderProps {
  org?: string;
  count: number;
}

export function AgentsHeader({ org, count }: AgentsHeaderProps) {
  const t = useT();

  const orgLabel = org
    ? `${t.pages.agents.orgLabel}: ${org}`
    : t.pages.agents.allOrgs;

  const countTemplate = count === 1
    ? t.pages.agents.countOne
    : t.pages.agents.countMany;

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.pages.agents.title}</h1>
      <p className="text-sm text-muted-foreground mt-1">
        {orgLabel} · {format(countTemplate, { count })}
      </p>
    </div>
  );
}
