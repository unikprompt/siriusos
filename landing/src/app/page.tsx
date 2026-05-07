'use client';

import { useEffect, useState } from 'react';
import {
  IconClock24,
  IconHierarchy2,
  IconBrandTelegram,
  IconCalendarEvent,
  IconArrowRight,
  IconBrandGithub,
  IconUsers,
  IconExternalLink,
} from '@tabler/icons-react';
import {
  type Locale,
  STRINGS,
  detectInitialLocale,
  LOCALE_STORAGE_KEY,
  SKOOL_URL,
  GITHUB_URL,
  NPM_URL,
} from '@/lib/i18n/welcome';

const PILLAR_ICONS = [
  IconClock24,
  IconHierarchy2,
  IconBrandTelegram,
  IconCalendarEvent,
];

export default function LandingPage() {
  const [locale, setLocale] = useState<Locale>('en');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocale(detectInitialLocale());
    setHydrated(true);
  }, []);

  function changeLocale(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch { /* ignore */ }
  }

  const t = STRINGS[locale];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="starfield pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
      <div className="cosmic-wash pointer-events-none absolute inset-0" aria-hidden="true" />

      {/* Top nav */}
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <svg
            width="24"
            height="24"
            viewBox="0 0 64 64"
            className="text-primary drop-shadow-[0_0_4px_rgba(61,111,229,0.3)] dark:drop-shadow-[0_0_5px_rgba(165,201,255,0.4)]"
            aria-hidden="true"
          >
            <path
              d="M 32 4 L 34 30 L 60 32 L 34 34 L 32 60 L 30 34 L 4 32 L 30 30 Z"
              fill="currentColor"
            />
            <circle cx="32" cy="32" r="2" fill="currentColor" opacity="0.55" />
          </svg>
          <span className="font-[family-name:var(--font-display)] text-[16px] font-semibold tracking-tight">
            SiriusOS
          </span>
        </a>

        <div className="flex items-center gap-2">
          <LocaleToggle locale={locale} onChange={changeLocale} hydrated={hydrated} />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <IconBrandGithub size={14} />
            GitHub
          </a>
          <a
            href="#install"
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t.nav.primary}
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-16 pb-24 text-center md:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success shadow-[0_0_6px_var(--success)]" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            {t.hero.eyebrow}
          </span>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
          {t.hero.headline}
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {t.hero.sub}
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#install"
            className="group inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_0_24px_-4px_rgba(61,111,229,0.4)] transition-all hover:-translate-y-px hover:shadow-[0_0_32px_-2px_rgba(61,111,229,0.5)] dark:shadow-[0_0_24px_-4px_rgba(165,201,255,0.35)] dark:hover:shadow-[0_0_32px_-2px_rgba(165,201,255,0.5)]"
          >
            {t.hero.ctaPrimary}
            <IconArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href={NPM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-6 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            View on npm
            <IconExternalLink size={14} className="opacity-60" />
          </a>
        </div>

        <p className="mt-9 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {t.hero.statusOnline}
        </p>
      </section>

      {/* Pillars */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 text-center">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-primary">
            {t.pillars.sectionEyebrow}
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight md:text-3xl">
            {t.pillars.sectionTitle}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" data-stagger>
          {t.pillars.items.map((item, i) => {
            const Icon = PILLAR_ICONS[i] ?? IconClock24;
            return (
              <div
                key={item.title}
                className="group rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all group-hover:ring-primary/30">
                  <Icon size={18} />
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="install" className="relative z-10 mx-auto max-w-5xl scroll-mt-12 px-6 py-16">
        <div className="mb-10 text-center">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-primary">
            {t.how.eyebrow}
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight md:text-3xl">
            {t.how.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">{t.how.sub}</p>
        </div>

        <div className="space-y-4">
          {t.how.steps.map((step, i) => (
            <div
              key={step.title}
              className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-[auto_1fr_auto]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-semibold text-primary ring-1 ring-primary/20">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{step.body}</p>
              </div>
              {step.code && (
                <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-foreground/85 md:min-w-[300px]">
                  <code>{step.code}</code>
                </pre>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Built on */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight md:text-2xl">
          {t.builtOn.title}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t.builtOn.body}
        </p>
      </section>

      {/* Operadores Aumentados — Skool community */}
      <section id="community" className="relative z-10 mx-auto max-w-3xl scroll-mt-12 px-6 py-16">
        <div className="rounded-2xl border border-accent/30 bg-card p-8 cosmic-wash">
          <div className="text-center">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
              {t.community.eyebrow}
            </p>

            <div className="mt-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/30">
              <IconUsers size={26} />
            </div>

            <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight md:text-3xl">
              {t.community.title}
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {t.community.body}
            </p>

            <a
              href={SKOOL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-7 text-sm font-medium text-accent-foreground shadow-[0_0_24px_-4px_rgba(201,152,42,0.4)] transition-all hover:-translate-y-px hover:shadow-[0_0_32px_-2px_rgba(201,152,42,0.5)] dark:shadow-[0_0_24px_-4px_rgba(255,210,122,0.4)] dark:hover:shadow-[0_0_32px_-2px_rgba(255,210,122,0.55)]"
            >
              {t.community.cta}
              <IconExternalLink size={15} className="transition-transform group-hover:translate-x-0.5" />
            </a>

            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {t.community.note}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto max-w-6xl border-t border-border px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {t.footer.tagline}
          </p>
          <div className="flex items-center gap-4">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <IconBrandGithub size={14} />
              GitHub
            </a>
            <span className="text-[12px] text-muted-foreground/60">·</span>
            <a
              href={NPM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              npm
            </a>
            <span className="text-[12px] text-muted-foreground/60">·</span>
            <span className="text-[12px] text-muted-foreground/70">{t.footer.rights}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LocaleToggle({
  locale,
  onChange,
  hydrated,
}: {
  locale: Locale;
  onChange: (l: Locale) => void;
  hydrated: boolean;
}) {
  return (
    <div
      className="inline-flex items-center rounded-md border border-border bg-surface p-0.5"
      style={{ visibility: hydrated ? 'visible' : 'hidden' }}
    >
      {(['en', 'es'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          aria-pressed={locale === code}
          className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors rounded-[5px] ${
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
