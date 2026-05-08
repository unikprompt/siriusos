'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { SplashScreen } from '@/components/layout/splash-screen';
import { LocaleToggle } from '@/components/locale-toggle';
import { useT, useLocale } from '@/lib/i18n';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const { locale, setLocale, hydrated } = useLocale();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  // Redirect to setup if no users exist
  useEffect(() => {
    fetch('/api/setup')
      .then((res) => res.json())
      .then((data) => {
        if (data.needsSetup) {
          router.push('/setup');
        }
      })
      .catch(() => {});
  }, [router]);

  // CSRF token strategy: fetch once, hold in a ref, inject on submit.
  // React state bound with value={csrfToken} and imperative writes via
  // querySelector both fail — React reconciliation resets uncontrolled
  // input values between the useEffect completion and the next render, so
  // the hidden input never carries the real token at submit time. The
  // hidden input in the JSX below is a placeholder; the real token is put
  // on the request body in handleSubmit().
  const csrfTokenRef = useRef<string>('');
  const [csrfReady, setCsrfReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
        const data = await res.json();
        if (cancelled) return;
        const token = data?.csrfToken;
        if (!token) {
          console.error('[login] /api/auth/csrf returned no token', data);
          return;
        }
        csrfTokenRef.current = token;
        setCsrfReady(true);
      } catch (err) {
        console.error('[login] csrf fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // POST the credentials callback ourselves with an
    // application/x-www-form-urlencoded body. NextAuth's CSRF validator
    // reads the csrfToken field from urlencoded bodies; a multipart/form-data
    // body (what `new FormData()` produces) fails with MissingCSRF because
    // the parser doesn't recover the token from the multipart stream.
    // Bypassing signIn() from next-auth/react lets us control the exact body.
    e.preventDefault();
    setLoading(true);
    setError('');

    const form = e.currentTarget;
    const usernameInput = form.querySelector('input[name="username"]') as HTMLInputElement | null;
    const passwordInput = form.querySelector('input[name="password"]') as HTMLInputElement | null;

    // Re-fetch CSRF token at submit time so body token matches the current
    // cookie. React StrictMode double-invokes the mount-time CSRF useEffect
    // in dev; if the two in-flight /api/auth/csrf responses resolve out of
    // order, the browser's authjs.csrf-token cookie can end up pinned to a
    // different token than csrfTokenRef.current — which the server rejects
    // as MissingCSRF. An atomic fetch-then-submit here forces cookie and
    // body into sync regardless of earlier mount-time races.
    let submitToken = csrfTokenRef.current;
    try {
      const freshCsrf = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
      const freshData = await freshCsrf.json();
      if (freshData?.csrfToken) submitToken = freshData.csrfToken;
    } catch {
      // Fall back to the mount-time token if the refetch fails.
    }

    const body = new URLSearchParams();
    body.set('csrfToken', submitToken || '');
    body.set('username', usernameInput?.value || '');
    body.set('password', passwordInput?.value || '');

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'same-origin',
        redirect: 'follow',
      });
      if (res.redirected) {
        const target = new URL(res.url);
        if (target.pathname.startsWith('/login')) {
          const code = target.searchParams.get('error') || 'Unknown';
          // CallbackRouteError usually means the rate limiter blocked the request.
          // Show a human-readable message instead of the raw error code.
          const msg = code === 'CallbackRouteError'
            ? t.login.tooManyAttempts
            : `${t.login.signInFailed}: ${code}`;
          setError(msg);
          setLoading(false);
          return;
        }
        // Navigate to the original destination the user tried to reach, or /
        // if none was recorded. Use window.location.origin to build a safe
        // relative-only target — res.url can be http://localhost:3000/ behind
        // a reverse proxy (when AUTH_URL is not set), which would send the
        // browser to the wrong host.
        const callbackParam = new URL(window.location.href).searchParams.get('callbackUrl');
        // Validate same-origin: must start with / but not // (which is a protocol-relative URL)
        const safeTarget = callbackParam && callbackParam.startsWith('/') && !callbackParam.startsWith('//') ? callbackParam : '/';
        window.location.href = safeTarget;
        return;
      }
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      setError(`${t.login.signInFailed} (${res.status})`);
      setLoading(false);
    } catch (err) {
      console.error('[login] submit error:', err);
      setError(t.login.networkError);
      setLoading(false);
    }
  }

  // Splash just needs to stay visible long enough - navigation happens in parallel
  const handleSplashComplete = useCallback(() => {
    // No-op: navigation already started above
  }, []);

  return (
    <>
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    <div className={`relative flex min-h-screen items-center justify-center overflow-hidden bg-background ${showSplash ? 'invisible' : ''}`}>
      {/* Starfield backdrop */}
      <div className="starfield pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
      {/* Cosmic gradient wash (theme-aware via .cosmic-wash) */}
      <div className="cosmic-wash pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative w-full max-w-sm space-y-7 px-4">
        {/* Mark + wordmark */}
        <div className="text-center space-y-3">
          <div className="inline-flex flex-col items-center gap-2">
            <svg
              width="56"
              height="56"
              viewBox="0 0 64 64"
              className="text-primary drop-shadow-[0_0_18px_rgba(61,111,229,0.35)] dark:drop-shadow-[0_0_20px_rgba(165,201,255,0.45)]"
              aria-hidden="true"
            >
              <path
                d="M 32 4 L 34 30 L 60 32 L 34 34 L 32 60 L 30 34 L 4 32 L 30 30 Z"
                fill="currentColor"
              />
              <circle cx="32" cy="32" r="2.5" fill="currentColor" opacity="0.6" />
            </svg>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              SiriusOS
            </h1>
          </div>
          <p className="text-xs text-muted-foreground tracking-wide">
            {t.login.tagline}
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-border bg-surface/80 backdrop-blur-sm">
          <CardHeader className="pb-4 flex flex-row items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle className="text-base">{t.login.cardTitle}</CardTitle>
              <CardDescription className="text-xs">
                {t.login.cardDescription}
              </CardDescription>
            </div>
            <LocaleToggle locale={locale} onChange={setLocale} hydrated={hydrated} />
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} method="POST" action="/api/auth/callback/credentials" className="space-y-4" suppressHydrationWarning>
              <input type="hidden" name="csrfToken" defaultValue="" suppressHydrationWarning />
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs">{t.login.usernameLabel}</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoFocus
                  placeholder={t.login.usernamePlaceholder}
                  suppressHydrationWarning
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">{t.login.passwordLabel}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder={t.login.passwordPlaceholder}
                  suppressHydrationWarning
                />
              </div>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading || !csrfReady}>
                {loading ? t.login.submitting : csrfReady ? t.login.submit : t.login.loadingCsrf}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
          SiriusOS · v2
        </p>
      </div>
    </div>
    </>
  );
}
