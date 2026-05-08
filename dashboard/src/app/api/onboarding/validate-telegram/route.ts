import { NextResponse } from 'next/server';
import { validateTelegramCreds } from '../../../../../../src/services/onboarding';

interface ValidateBody {
  botToken?: string;
  chatId?: string;
}

export async function POST(request: Request) {
  let body: ValidateBody;
  try {
    body = (await request.json()) as ValidateBody;
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_request' }, { status: 400 });
  }

  const botToken = body.botToken?.trim() ?? '';
  const chatId = body.chatId?.trim() ?? '';
  if (!botToken) {
    return NextResponse.json({ ok: false, reason: 'missing_token' }, { status: 400 });
  }
  if (!chatId) {
    return NextResponse.json({ ok: false, reason: 'missing_chat_id' }, { status: 400 });
  }

  try {
    const result = await validateTelegramCreds(botToken, chatId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: 'crash', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
