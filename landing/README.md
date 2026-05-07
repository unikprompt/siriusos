# SiriusOS Landing

Standalone Next.js app for the public marketing landing at
`siriusos.unikprompt.com`.

Independent of the operator dashboard so the landing stays online even
when no operator instance is running.

## Local dev

```bash
cd landing
npm install
npm run dev          # http://localhost:4000/welcome
```

## Deploy to Vercel

1. Connect this repo to Vercel from your account.
2. **Root directory**: set to `landing/` (not the repo root).
3. Framework preset: Next.js (auto-detected).
4. Build command: `npm run build` (default).
5. Add custom domain `siriusos.unikprompt.com` after deploy.

## Stack

- Next.js 16 (App Router) — same as the dashboard for visual consistency
- Tailwind CSS v4 + Stellar Night design tokens
- Bilingual EN/ES with localStorage-persisted toggle
- Zero runtime: no DB, no auth, no API. Pure static + client-side
  language switch.
