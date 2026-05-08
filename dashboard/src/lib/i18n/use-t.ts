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
