'use client';

import { useT } from '@/lib/i18n';

interface AnalyticsHeaderProps {
  org?: string;
}

export function AnalyticsHeader({ org }: AnalyticsHeaderProps) {
  const t = useT();
  const orgLabel = org
    ? `${t.pages.agents.orgLabel}: ${org}`
    : t.pages.agents.allOrgs;

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
        {t.nav.items.analytics}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {orgLabel} · {t.pages.analytics.subtitle}
      </p>
    </div>
  );
}
