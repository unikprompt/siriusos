import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type EmptyKind = 'star' | 'constellation' | 'orbit' | 'silence';

interface EmptyStateProps {
  kind?: EmptyKind;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState — astronomical illustrations for "nothing here yet" surfaces.
 *
 *  - `star`         — single Sirius glyph, dimmed. Default.
 *  - `constellation`— scattered stars connected by faint lines. For listings.
 *  - `orbit`        — a star with an orbit ring. For workflow/cron pages.
 *  - `silence`      — empty wave/signal. For comms / activity pages.
 */
export function EmptyState({
  kind = 'star',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-12 px-4 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground/40">
        <Illustration kind={kind} />
      </div>
      <div className="space-y-1.5">
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function Illustration({ kind }: { kind: EmptyKind }) {
  const common = {
    width: 84,
    height: 84,
    viewBox: '0 0 84 84',
    fill: 'none',
    'aria-hidden': true as const,
  };

  if (kind === 'star') {
    return (
      <svg {...common}>
        <path
          d="M 42 12 L 44 38 L 70 42 L 44 46 L 42 72 L 40 46 L 14 42 L 40 38 Z"
          fill="currentColor"
        />
        <circle cx="42" cy="42" r="2.2" fill="currentColor" opacity="0.55" />
      </svg>
    );
  }

  if (kind === 'constellation') {
    return (
      <svg {...common}>
        {/* faint connector lines */}
        <line x1="20" y1="20" x2="42" y2="38" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
        <line x1="42" y1="38" x2="64" y2="22" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
        <line x1="42" y1="38" x2="50" y2="64" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
        <line x1="50" y1="64" x2="22" y2="62" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
        {/* small stars */}
        <circle cx="20" cy="20" r="2.2" fill="currentColor" />
        <circle cx="64" cy="22" r="1.8" fill="currentColor" opacity="0.8" />
        <circle cx="22" cy="62" r="1.6" fill="currentColor" opacity="0.7" />
        <circle cx="50" cy="64" r="2" fill="currentColor" opacity="0.85" />
        {/* center brighter Sirius */}
        <path
          d="M 42 30 L 43 38 L 51 39 L 43 40 L 42 48 L 41 40 L 33 39 L 41 38 Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (kind === 'orbit') {
    return (
      <svg {...common}>
        <ellipse
          cx="42"
          cy="42"
          rx="28"
          ry="14"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.4"
          fill="none"
        />
        <ellipse
          cx="42"
          cy="42"
          rx="14"
          ry="28"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.25"
          fill="none"
        />
        <path
          d="M 42 28 L 43.5 40.5 L 56 42 L 43.5 43.5 L 42 56 L 40.5 43.5 L 28 42 L 40.5 40.5 Z"
          fill="currentColor"
        />
        <circle cx="70" cy="42" r="2" fill="currentColor" opacity="0.7" />
      </svg>
    );
  }

  // silence — flat wave with one star
  return (
    <svg {...common}>
      <path
        d="M 8 42 L 22 42 L 28 38 L 36 46 L 44 42 L 60 42 L 76 42"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.5"
        fill="none"
      />
      <path
        d="M 42 18 L 43 24 L 49 25 L 43 26 L 42 32 L 41 26 L 35 25 L 41 24 Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}
