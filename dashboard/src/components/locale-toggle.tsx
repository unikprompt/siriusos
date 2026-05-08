'use client';

import { type Locale, SUPPORTED_LOCALES } from '@/lib/i18n';

interface LocaleToggleProps {
  locale: Locale;
  onChange: (locale: Locale) => void;
  hydrated: boolean;
  className?: string;
}

export function LocaleToggle({ locale, onChange, hydrated, className = '' }: LocaleToggleProps) {
  return (
    <div
      className={`inline-flex items-center rounded-md border border-border bg-surface p-0.5 ${className}`}
      style={{ visibility: hydrated ? 'visible' : 'hidden' }}
      role="group"
      aria-label="Language"
    >
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          aria-pressed={locale === code}
          className={`rounded-[5px] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            locale === code
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
