import { describe, it, expect } from 'vitest';
import {
  parseEmail,
  parseHeaders,
  decodeQuotedPrintable,
  decodeBase64,
  decodeEncodedWords,
  stripHtml,
} from '../src/mail/mime.js';
import { parseSearchUids, contiguousWatermark } from '../src/mail/imap-poller.js';

describe('mime helpers', () => {
  it('decodes quoted-printable with soft line breaks', () => {
    expect(decodeQuotedPrintable('Hola=20mundo').toString('utf-8')).toBe('Hola mundo');
    expect(decodeQuotedPrintable('linea1=\r\nlinea2').toString('utf-8')).toBe('linea1linea2');
    // UTF-8 "á" = C3 A1
    expect(decodeQuotedPrintable('caf=C3=A9').toString('utf-8')).toBe('café');
  });

  it('decodes base64 ignoring embedded whitespace', () => {
    expect(decodeBase64('SG9sYQ==').toString('utf-8')).toBe('Hola');
    expect(decodeBase64('SG9s\r\nYQ==').toString('utf-8')).toBe('Hola');
  });

  it('decodes RFC 2047 encoded-words (B and Q)', () => {
    expect(decodeEncodedWords('=?UTF-8?B?SG9sYQ==?=')).toBe('Hola');
    expect(decodeEncodedWords('=?UTF-8?Q?Hola_mundo?=')).toBe('Hola mundo');
    expect(decodeEncodedWords('=?UTF-8?Q?caf=C3=A9?=')).toBe('café');
    expect(decodeEncodedWords('plain text')).toBe('plain text');
  });

  it('unfolds and lowercases headers', () => {
    const h = parseHeaders('Subject: hola\n mundo\nFrom: a@b.com');
    expect(h.get('subject')).toBe('hola mundo');
    expect(h.get('from')).toBe('a@b.com');
  });

  it('strips html to text', () => {
    const t = stripHtml('<p>Hola</p><br><b>mundo</b><script>x()</script>');
    expect(t).toContain('Hola');
    expect(t).toContain('mundo');
    expect(t).not.toContain('<');
    expect(t).not.toContain('x()');
  });
});

describe('parseEmail', () => {
  it('parses a simple text/plain message', () => {
    const raw = [
      'From: Mario <mario@example.com>',
      'Subject: Prueba',
      'Date: Wed, 16 Jul 2026 12:00:00 -0400',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Cuerpo del correo con café.',
    ].join('\r\n');
    const email = parseEmail(raw);
    expect(email.from).toBe('Mario <mario@example.com>');
    expect(email.subject).toBe('Prueba');
    expect(email.text).toContain('Cuerpo del correo');
    expect(email.attachments).toHaveLength(0);
  });

  it('decodes an encoded-word subject and quoted-printable body', () => {
    const raw = [
      'From: =?UTF-8?Q?Jos=C3=A9?= <jose@example.com>',
      'Subject: =?UTF-8?B?QXN1bnRvIGltcG9ydGFudGU=?=',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Reuni=C3=B3n el martes.',
    ].join('\r\n');
    const email = parseEmail(raw);
    expect(email.from).toContain('José');
    expect(email.subject).toBe('Asunto importante');
    expect(email.text).toContain('Reunión el martes.');
  });

  it('prefers text/plain over text/html in multipart/alternative', () => {
    const raw = [
      'From: a@b.com',
      'Subject: Multi',
      'Content-Type: multipart/alternative; boundary="BOUND"',
      '',
      '--BOUND',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Version texto plano.',
      '--BOUND',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Version HTML.</p>',
      '--BOUND--',
    ].join('\r\n');
    const email = parseEmail(raw);
    expect(email.text).toContain('Version texto plano.');
    expect(email.text).not.toContain('HTML');
  });

  it('falls back to stripped HTML when there is no text/plain', () => {
    const raw = [
      'From: a@b.com',
      'Subject: HtmlOnly',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Solo <b>HTML</b> aqui</p>',
    ].join('\r\n');
    const email = parseEmail(raw);
    expect(email.text).toContain('Solo');
    expect(email.text).toContain('HTML');
    expect(email.text).not.toContain('<p>');
  });

  it('extracts a base64 attachment from multipart/mixed', () => {
    const payload = Buffer.from('archivo binario', 'utf-8').toString('base64');
    const raw = [
      'From: a@b.com',
      'Subject: ConAdjunto',
      'Content-Type: multipart/mixed; boundary="X"',
      '',
      '--X',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Mira el adjunto.',
      '--X',
      'Content-Type: application/pdf; name="doc.pdf"',
      'Content-Disposition: attachment; filename="doc.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      payload,
      '--X--',
    ].join('\r\n');
    const email = parseEmail(raw);
    expect(email.text).toContain('Mira el adjunto.');
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0].filename).toBe('doc.pdf');
    expect(email.attachments[0].contentType).toBe('application/pdf');
    expect(email.attachments[0].content.toString('utf-8')).toBe('archivo binario');
  });

  it('never throws on a malformed message', () => {
    const email = parseEmail('garbage without headers or body separator');
    expect(email).toBeTruthy();
    expect(typeof email.text).toBe('string');
  });
});

describe('imap poller pure helpers', () => {
  it('parses IMAP SEARCH response to UIDs', () => {
    expect(parseSearchUids('* SEARCH 3 5 7\r\nA1 OK\r\n')).toEqual(['3', '5', '7']);
    expect(parseSearchUids('* SEARCH\r\nA1 OK\r\n')).toEqual([]); // sin resultados
    expect(parseSearchUids('nada relevante')).toEqual([]);
  });

  it('advances watermark only over the contiguous delivered prefix', () => {
    // Todos entregados: avanza al máximo.
    expect(contiguousWatermark(100, [101, 102, 103], new Set([101, 102, 103]))).toBe(103);
    // Hueco no entregado en 102: se detiene en 101, reintenta 102/103 luego.
    expect(contiguousWatermark(100, [101, 102, 103], new Set([101, 103]))).toBe(101);
    // Nada entregado: no avanza.
    expect(contiguousWatermark(100, [101, 102], new Set())).toBe(100);
    // Sin candidatos: se queda igual.
    expect(contiguousWatermark(100, [], new Set())).toBe(100);
  });
});
