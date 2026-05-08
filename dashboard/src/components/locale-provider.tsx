'use client';

import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  type Locale,
  LOCALE_STORAGE_KEY,
  detectInitialLocale,
  isLocale,
} from '@/lib/i18n';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  hydrated: boolean;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleProviderProps {
  children: ReactNode;
  // Optional override (e.g., from server-side cookie). If provided, used as initial locale.
  initialLocale?: Locale;
}

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  // SSR renders with `en` (or provided initial) to avoid hydration mismatch.
  // Real locale is detected on mount.
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? 'en');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const detected = detectInitialLocale();
    setLocaleState(detected);
    setHydrated(true);
  }, []);

  // Reflect locale on <html lang> so screen readers and Lighthouse stay accurate.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, hydrated }}>
      {children}
    </LocaleContext.Provider>
  );
}
