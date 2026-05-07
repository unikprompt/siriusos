import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CTX_ROOT } from '@/lib/config';

// In-memory rate limit: 3 submissions per IP per hour.
// Resets on dashboard restart, which is fine for this use case.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const submissions: Map<string, number[]> = new Map();

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const entries = (submissions.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (entries.length >= RATE_LIMIT_MAX) return false;
  entries.push(now);
  submissions.set(ip, entries);
  return true;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WaitlistBody {
  email?: unknown;
  note?: unknown;
  locale?: unknown;
  // Honeypot — real users never fill this.
  company?: unknown;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (!rateLimitOk(ip)) {
    return Response.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429 },
    );
  }

  let body: WaitlistBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Honeypot trip — silently accept (don't tell bots they failed)
  if (typeof body.company === 'string' && body.company.length > 0) {
    return Response.json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !EMAIL_REGEX.test(email) || email.length > 200) {
    return Response.json({ error: 'Invalid email' }, { status: 400 });
  }

  const note =
    typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const locale =
    body.locale === 'es' || body.locale === 'en' ? body.locale : 'en';

  const entry = {
    timestamp: new Date().toISOString(),
    email,
    note,
    locale,
    ip,
    user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? '',
  };

  try {
    const dir = path.join(CTX_ROOT, 'waitlist');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'requests.jsonl');
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[waitlist] write failed:', err);
    return Response.json({ error: 'Storage error' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
