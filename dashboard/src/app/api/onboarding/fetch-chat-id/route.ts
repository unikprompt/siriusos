import { NextResponse } from 'next/server';
import { fetchChatId } from '../../../../../../src/services/onboarding';

interface FetchBody {
  botToken?: string;
}

/**
 * Probe the Telegram API for the most recent chat ID a bot has seen.
 * Mirrors the auto-detect step in `siriusos setup` so the wizard UX
 * does not require the user to copy the chat id from t.me/@userinfobot.
 */
export async function POST(request: Request) {
  let body: FetchBody;
  try {
    body = (await request.json()) as FetchBody;
  } catch {
    return NextResponse.json({ chatId: '', reason: 'bad_request' }, { status: 400 });
  }

  const botToken = body.botToken?.trim() ?? '';
  if (!botToken) {
    return NextResponse.json({ chatId: '', reason: 'missing_token' }, { status: 400 });
  }

  // fetchChatId spawns a short-lived subprocess; route handlers run server-side
  // so this is fine. Returns empty string when no recent message exists.
  const chatId = fetchChatId(botToken);
  return NextResponse.json({ chatId });
}
