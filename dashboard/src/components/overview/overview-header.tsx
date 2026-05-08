'use client';

import Link from 'next/link';
import { useT, format } from '@/lib/i18n';

interface OverviewHeaderProps {
  org: string;
  totalActions: number;
}

export function OverviewHeader({ org, totalActions }: OverviewHeaderProps) {
  const t = useT();

  const orgLabel = org
    ? `${t.pages.overview.orgLabel}: ${org}`
    : t.pages.overview.allOrgs;

  const actionsTemplate = totalActions === 1
    ? t.pages.overview.actionsNeededOne
    : t.pages.overview.actionsNeededMany;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.pages.overview.title}</h1>
        <p className="text-sm text-muted-foreground">{orgLabel}</p>
      </div>
      {totalActions > 0 && (
        <Link
          href="/approvals"
          className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
          {format(actionsTemplate, { count: totalActions })}
        </Link>
      )}
    </div>
  );
}
