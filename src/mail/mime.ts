/**
 * Parser MIME mínimo para el IMAP poller (sin dependencias externas).
 *
 * Cubre el caso de uso real: correos normales que Mario reenvía a un buzón
 * dedicado. Maneja headers plegados, encoded-words RFC 2047 en Subject/From,
 * multipart (altern, mixed, related) con recursión, Content-Transfer-Encoding
 * base64 y quoted-printable, y strip de HTML cuando no hay text/plain.
 *
 * NO pretende ser un parser MIME completo (no maneja charsets exóticos ni
 * anidamientos raros con robustez total). Si aparece un correo que no parsea
 * bien, se degrada a "cuerpo no extraíble" en vez de crashear — el poller
 * nunca debe romper por un correo mal formado.
 */

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface ParsedEmail {
  from: string;
  subject: string;
  date: string;
  /** Mejor esfuerzo de cuerpo en texto plano (text/plain, o HTML degradado). */
  text: string;
  attachments: ParsedAttachment[];
}

interface MimePart {
  headers: Map<string, string>;
  /** Cuerpo crudo de la parte (antes de decodificar transfer-encoding). */
  rawBody: string;
}

/** Separa el bloque de headers del cuerpo en el primer CRLF/LF en blanco. */
function splitHeadersBody(raw: string): { headerBlock: string; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n');
  const idx = normalized.indexOf('\n\n');
  if (idx === -1) return { headerBlock: normalized, body: '' };
  return { headerBlock: normalized.slice(0, idx), body: normalized.slice(idx + 2) };
}

/** Despliega headers plegados (líneas de continuación que empiezan con espacio/tab). */
function unfoldHeaders(headerBlock: string): string[] {
  const lines = headerBlock.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += ' ' + line.trim();
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Parsea headers a un Map (clave en minúscula → primer valor). */
export function parseHeaders(headerBlock: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of unfoldHeaders(headerBlock)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

/** Decodifica quoted-printable a bytes. */
export function decodeQuotedPrintable(input: string): Buffer {
  // Soft line breaks: "=" al final de línea se elimina.
  const withoutSoftBreaks = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    const ch = withoutSoftBreaks[i];
    if (ch === '=' && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(ch.charCodeAt(0) & 0xff);
  }
  return Buffer.from(bytes);
}

/** Decodifica base64 a bytes (tolerante a whitespace embebido). */
export function decodeBase64(input: string): Buffer {
  return Buffer.from(input.replace(/\s+/g, ''), 'base64');
}

/**
 * Decodifica encoded-words RFC 2047 en headers, ej.
 * "=?UTF-8?B?SG9sYQ==?=" → "Hola", "=?UTF-8?Q?Hola_mundo?=" → "Hola mundo".
 */
export function decodeEncodedWords(input: string): string {
  if (!input.includes('=?')) return input;
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_m, charset: string, enc: string, data: string) => {
      try {
        let buf: Buffer;
        if (enc.toUpperCase() === 'B') {
          buf = decodeBase64(data);
        } else {
          // Q-encoding: "_" es espacio; "=XX" es hex.
          buf = decodeQuotedPrintable(data.replace(/_/g, ' '));
        }
        return bufferToString(buf, charset);
      } catch {
        return _m;
      }
    },
  ).replace(/\?=\s+=\?/g, ''); // junta encoded-words adyacentes separados por espacio
}

/** Convierte un Buffer a string según charset (utf-8 por defecto, latin1 fallback). */
function bufferToString(buf: Buffer, charset?: string): string {
  const cs = (charset || 'utf-8').toLowerCase();
  if (cs === 'utf-8' || cs === 'utf8' || cs === 'us-ascii' || cs === 'ascii') {
    return buf.toString('utf-8');
  }
  if (cs === 'iso-8859-1' || cs === 'latin1' || cs === 'windows-1252') {
    return buf.toString('latin1');
  }
  // Charset desconocido: intentar utf-8 (mejor esfuerzo).
  return buf.toString('utf-8');
}

/** Extrae el valor de un parámetro de un header tipo Content-Type. */
function getParam(headerValue: string, param: string): string | undefined {
  const re = new RegExp(`${param}\\s*=\\s*("([^"]*)"|([^;\\s]+))`, 'i');
  const m = headerValue.match(re);
  if (!m) return undefined;
  return m[2] !== undefined ? m[2] : m[3];
}

/** Decodifica el cuerpo de una parte según su Content-Transfer-Encoding. */
function decodePartBody(part: MimePart): Buffer {
  const enc = (part.headers.get('content-transfer-encoding') || '7bit').toLowerCase().trim();
  if (enc === 'base64') return decodeBase64(part.rawBody);
  if (enc === 'quoted-printable') return decodeQuotedPrintable(part.rawBody);
  return Buffer.from(part.rawBody, 'binary');
}

/** Divide un cuerpo multipart en sus partes usando el boundary. */
function splitMultipart(body: string, boundary: string): MimePart[] {
  const delimiter = `--${boundary}`;
  const segments = body.split(delimiter);
  const parts: MimePart[] = [];
  // El primer segmento es el preámbulo; el último que empieza con "--" es el cierre.
  for (let i = 1; i < segments.length; i++) {
    let seg = segments[i];
    if (seg.startsWith('--')) break; // boundary de cierre "--boundary--"
    // Quitar el salto de línea inicial que sigue al delimiter.
    seg = seg.replace(/^\r?\n/, '');
    const { headerBlock, body: partBody } = splitHeadersBody(seg);
    parts.push({ headers: parseHeaders(headerBlock), rawBody: partBody });
  }
  return parts;
}

/** Elimina tags HTML y decodifica entidades básicas para degradar HTML a texto. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/**
 * Recorre una parte (posiblemente multipart) acumulando el mejor cuerpo de
 * texto y los adjuntos. Prefiere text/plain; si solo hay HTML lo degrada.
 */
function walkPart(
  part: MimePart,
  acc: { plain: string; html: string; attachments: ParsedAttachment[] },
): void {
  const ctype = (part.headers.get('content-type') || 'text/plain').toLowerCase();
  const disposition = (part.headers.get('content-disposition') || '').toLowerCase();
  const rawCtypeHeader = part.headers.get('content-type') || '';
  const filename =
    getParam(part.headers.get('content-disposition') || '', 'filename') ||
    getParam(rawCtypeHeader, 'name');

  // Adjunto: disposition attachment, o cualquier parte con filename que no sea texto inline.
  const isAttachment =
    disposition.includes('attachment') ||
    (!!filename && !ctype.startsWith('text/') && !ctype.startsWith('multipart/'));

  if (ctype.startsWith('multipart/')) {
    const boundary = getParam(rawCtypeHeader, 'boundary');
    if (boundary) {
      for (const child of splitMultipart(part.rawBody, boundary)) {
        walkPart(child, acc);
      }
    }
    return;
  }

  if (isAttachment && filename) {
    acc.attachments.push({
      filename: decodeEncodedWords(filename),
      contentType: ctype.split(';')[0].trim(),
      content: decodePartBody(part),
    });
    return;
  }

  const charset = getParam(rawCtypeHeader, 'charset');
  if (ctype.startsWith('text/plain')) {
    const decoded = bufferToString(decodePartBody(part), charset);
    acc.plain += (acc.plain ? '\n' : '') + decoded;
  } else if (ctype.startsWith('text/html')) {
    const decoded = bufferToString(decodePartBody(part), charset);
    acc.html += (acc.html ? '\n' : '') + decoded;
  }
}

/**
 * Parsea un mensaje RFC 822/MIME crudo (tal como lo devuelve curl al hacer
 * FETCH). Nunca lanza: ante un mensaje ilegible devuelve lo que pudo extraer.
 */
export function parseEmail(raw: string): ParsedEmail {
  const { headerBlock } = splitHeadersBody(raw);
  const topHeaders = parseHeaders(headerBlock);
  const from = decodeEncodedWords(topHeaders.get('from') || '(remitente desconocido)');
  const subject = decodeEncodedWords(topHeaders.get('subject') || '(sin asunto)');
  const date = topHeaders.get('date') || '';

  const acc = { plain: '', html: '', attachments: [] as ParsedAttachment[] };
  try {
    const { headerBlock: hb, body } = splitHeadersBody(raw);
    walkPart({ headers: parseHeaders(hb), rawBody: body }, acc);
  } catch {
    // Degradar en silencio: dejamos el cuerpo vacío, el poller lo marca como no extraíble.
  }

  let text = acc.plain.trim();
  if (!text && acc.html) text = stripHtml(acc.html);
  if (!text) text = '(cuerpo no extraíble en texto)';

  return { from, subject, date, text, attachments: acc.attachments };
}
