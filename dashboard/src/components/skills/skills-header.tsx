'use client';

import { useT } from '@/lib/i18n';

export function SkillsHeader() {
  const t = useT();
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
        {t.nav.items.skills}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {t.pages.skills.subtitle}
      </p>
    </div>
  );
}
