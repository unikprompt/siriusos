import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelegramAPI } from '../../../src/telegram/api';

describe('TelegramAPI.sendMessage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let api: TelegramAPI;

  beforeEach(() => {
    api = new TelegramAPI('TEST_TOKEN');
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    } as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  function lastBody() {
    const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    return JSON.parse(call[1].body as string);
  }

  it('defaults to Markdown parse_mode', async () => {
    await api.sendMessage('123', 'hello world');
    const body = lastBody();
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toBe('hello world');
  });

  it('omits parse_mode when parseMode is none', async () => {
    await api.sendMessage('123', 'hello world', undefined, 'none');
    const body = lastBody();
    expect(body).not.toHaveProperty('parse_mode');
    expect(body.text).toBe('hello world');
  });

  it('keeps special chars literal in plain-text mode', async () => {
    const tricky = 'snake_case * [link](url) `code` ! - ?';
    await api.sendMessage('123', tricky, undefined, 'none');
    const body = lastBody();
    expect(body.text).toBe(tricky);
    expect(body).not.toHaveProperty('parse_mode');
  });

  it('does not strip backslash escapes in plain-text mode', async () => {
    // In Markdown mode, sanitizeMarkdown removes backslashes from non-special chars.
    // In plain-text mode, backslashes are passed through literally.
    const text = 'a\\b c\\!d';
    await api.sendMessage('123', text, undefined, 'none');
    expect(lastBody().text).toBe(text);
  });

  it('preserves replyMarkup with parseMode none', async () => {
    const keyboard = { inline_keyboard: [[{ text: 'yes', callback_data: 'y' }]] };
    await api.sendMessage('123', 'pick one', keyboard, 'none');
    const body = lastBody();
    expect(body.reply_markup).toEqual(keyboard);
    expect(body).not.toHaveProperty('parse_mode');
  });

  it('splits long messages and omits parse_mode in every chunk (plain-text)', async () => {
    const long = 'x'.repeat(4096 * 2 + 10); // 3 chunks
    await api.sendMessage('123', long, undefined, 'none');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse(call[1].body as string);
      expect(body).not.toHaveProperty('parse_mode');
    }
  }, 10000);

  it('splits long messages and keeps parse_mode in every chunk (Markdown default)', async () => {
    const long = 'x'.repeat(4096 * 2 + 10);
    await api.sendMessage('123', long);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse(call[1].body as string);
      expect(body.parse_mode).toBe('Markdown');
    }
  }, 10000);
});
