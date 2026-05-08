export type Locale = 'en' | 'es';

export const LOCALE_STORAGE_KEY = 'siriusos-locale';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'es'] as const;

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore — private browsing, etc. */
  }
  const lang = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() ?? '' : '';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}

export { useLocale, useT } from './use-t';
export type { DashboardStrings } from './dashboard';
