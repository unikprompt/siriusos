'use client';

import { useContext } from 'react';
import { LocaleContext } from '@/components/locale-provider';
import { DASHBOARD_STRINGS, type DashboardStrings } from './dashboard';
import type { Locale } from './index';

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  hydrated: boolean;
} {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used inside <LocaleProvider>');
  }
  return ctx;
}

export function useT(): DashboardStrings {
  const { locale } = useLocale();
  return DASHBOARD_STRINGS[locale];
}

/** Replace `{name}` placeholders with values. Numbers are coerced to string. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}
