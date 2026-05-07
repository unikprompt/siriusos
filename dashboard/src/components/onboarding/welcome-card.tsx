'use client';

import { useEffect, useState } from 'react';
import {
  IconRobot,
  IconBrandTelegram,
  IconBook2,
  IconX,
} from '@tabler/icons-react';

const DISMISS_KEY = 'siriusos-welcome-dismissed';

export function WelcomeCard() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) setDismissed(false);
  }, []);

  function dismiss() {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    }
  }

  if (dismissed) return null;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-primary/20 bg-card p-6 cosmic-wash"
    >
      <div className="starfield pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome card"
        className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <IconX size={16} />
      </button>

      <div className="relative flex items-start gap-5">
        <svg
          width="48"
          height="48"
          viewBox="0 0 64 64"
          className="shrink-0 text-primary drop-shadow-[0_0_10px_rgba(61,111,229,0.3)] dark:drop-shadow-[0_0_14px_rgba(165,201,255,0.45)]"
          aria-hidden="true"
        >
          <path
            d="M 32 4 L 34 30 L 60 32 L 34 34 L 32 60 L 30 34 L 4 32 L 30 30 Z"
            fill="currentColor"
          />
          <circle cx="32" cy="32" r="2.4" fill="currentColor" opacity="0.55" />
        </svg>

        <div className="flex-1 min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
            Welcome to SiriusOS
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Persistent AI agents, always on. Three things to get rolling:
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Step
              icon={<IconRobot size={16} />}
              title="Create an agent"
              body={
                <>
                  Run{' '}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                    siriusos init &lt;name&gt;
                  </code>{' '}
                  in your terminal. Each agent runs persistently in its own session.
                </>
              }
            />
            <Step
              icon={<IconBrandTelegram size={16} />}
              title="Wire Telegram"
              body={
                <>
                  Add{' '}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                    TELEGRAM_BOT_TOKEN
                  </code>{' '}
                  in your agent&apos;s config to receive heartbeats and approvals on the go.
                </>
              }
            />
            <Step
              icon={<IconBook2 size={16} />}
              title="Read the docs"
              body={
                <>
                  See{' '}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                    siriusos --help
                  </code>{' '}
                  and the README in the repo for CLI reference and tutorials.
                </>
              }
            />
          </div>

          <div className="mt-5 flex items-center justify-end">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Got it, dismiss →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 p-3 transition-colors hover:bg-surface">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
          {icon}
        </div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
