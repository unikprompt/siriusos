import { readdirSync, readFileSync, renameSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { createHmac, timingSafeEqual } from 'crypto';
import type { InboxMessage, Priority, BusPaths } from '../types/index.js';
import { PRIORITY_MAP } from '../types/index.js';
import { atomicWriteSync, ensureDir } from '../utils/atomic.js';
import { acquireLock, releaseLock } from '../utils/lock.js';
import { randomString } from '../utils/random.js';
import { validateAgentName, validatePriority } from '../utils/validate.js';

// ---------------------------------------------------------------------------
// Security (H10): HMAC-SHA256 message signing
// ---------------------------------------------------------------------------

/**
 * Load the shared bus signing key from config.
 * Returns null if the key file doesn't exist (legacy installs without signing).
 */
function loadSigningKey(ctxRoot: string): string | null {
  const keyPath = join(ctxRoot, 'config', 'bus-signing-key');
  if (!existsSync(keyPath)) return null;
  try {
    return readFileSync(keyPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

function hmacSign(key: string, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('hex');
}

function hmacVerify(key: string, payload: string, sig: string): boolean {
  const expected = hmacSign(key, payload);
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

function signPayload(msgId: string, from: string, to: string, text: string): string {
  return `${msgId}:${from}:${to}:${text}`;
}

/**
 * Send a message to another agent's inbox.
 * Creates a JSON file with format: {pnum}-{epochMs}-from-{sender}-{rand5}.json
 * Identical to bash send-message.sh output.
 */
export function sendMessage(
  paths: BusPaths,
  from: string,
  to: string,
  priority: Priority,
  text: string,
  replyTo?: string,
): string {
  validateAgentName(from);
  validateAgentName(to);
  validatePriority(priority);

  // A blank agent message is never meaningful: it would silently produce a real
  // msgId that looks like a successful send while delivering nothing. This is
  // the classic pipe footgun — piping empty/whitespace stdin into send-message
  // still "succeeds" and returns an id. Reject it so the caller learns the send
  // did not happen. Only the emptiness CHECK trims; the stored text below is
  // preserved verbatim (leading/trailing whitespace kept).
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('sendMessage: refusing to send an empty message (text is blank)');
  }

  const pnum = PRIORITY_MAP[priority];
  const epochMs = Date.now();
  const rand = randomString(5);
  const msgId = `${epochMs}-${from}-${rand}`;
  const filename = `${pnum}-${epochMs}-from-${from}-${rand}.json`;

  // Security (H10): Sign message with HMAC-SHA256.
  const signingKey = loadSigningKey(paths.ctxRoot);
  const message: InboxMessage = {
    id: msgId,
    from,
    to,
    priority,
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    text,
    reply_to: replyTo || null,
    ...(signingKey ? { sig: hmacSign(signingKey, signPayload(msgId, from, to, text)) } : {}),
  };

  // Write to target agent's inbox
  const inboxDir = join(paths.ctxRoot, 'inbox', to);
  ensureDir(inboxDir);
  atomicWriteSync(join(inboxDir, filename), JSON.stringify(message));

  return msgId;
}

/**
 * Check inbox for pending messages.
 * Reads inbox directory, moves messages to inflight, returns sorted array.
 * Recovers stale inflight messages (>5 minutes old).
 * Identical to bash check-inbox.sh behavior.
 */
export function checkInbox(paths: BusPaths): InboxMessage[] {
  const { inbox, inflight } = paths;
  ensureDir(inbox);
  ensureDir(inflight);

  // Acquire lock
  if (!acquireLock(inbox)) {
    return [];
  }

  try {
    // Recover stale inflight messages (>5 min old)
    recoverStaleInflight(inflight, inbox, 300);

    // Read and sort messages by filename (priority then timestamp)
    const files = readdirSync(inbox)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'))
      .sort();

    if (files.length === 0) {
      return [];
    }

    // Security (H10): Load signing key for HMAC verification.
    const signingKey = loadSigningKey(paths.ctxRoot);

    const messages: InboxMessage[] = [];
    for (const file of files) {
      const srcPath = join(inbox, file);
      try {
        const content = readFileSync(srcPath, 'utf-8');
        const msg: InboxMessage = JSON.parse(content);

        // Security (H10): Verify HMAC signature if key is available and message has sig.
        if (signingKey && msg.sig) {
          const valid = hmacVerify(signingKey, signPayload(msg.id, msg.from, msg.to, msg.text), msg.sig);
          if (!valid) {
            console.error(`[bus/message] SECURITY: Message ${msg.id} from '${msg.from}' failed HMAC verification — rejecting`);
            const errDir = join(inbox, '.errors');
            ensureDir(errDir);
            try { renameSync(srcPath, join(errDir, file)); } catch { /* ignore */ }
            continue;
          }
        } else if (signingKey && !msg.sig) {
          // Signing key exists but message has no sig — legacy message, log warning
          console.warn(`[bus/message] WARNING: Unsigned message ${msg.id} from '${msg.from}' — accepted (legacy)`);
        }

        // Move to inflight
        const destPath = join(inflight, file);
        renameSync(srcPath, destPath);
        messages.push(msg);
      } catch {
        // Move corrupt files to .errors/
        const errDir = join(inbox, '.errors');
        ensureDir(errDir);
        try {
          renameSync(srcPath, join(errDir, file));
        } catch {
          // Ignore if move fails
        }
      }
    }

    return messages;
  } finally {
    releaseLock(inbox);
  }
}

/**
 * Outcome of an ackInbox call. The three states mirror the kb-ingest pattern
 * (success / failure / don't-know): the third state exists because there is a
 * situation where the result honestly cannot be determined, and folding it into
 * either of the other two would lie.
 *  - `acked`      — a matching inflight message was found and moved to processed.
 *  - `not_found`  — no inflight message with this id (or no inflight dir at all).
 *                   A clean no-op; nothing was acked, but nothing is wrong. This
 *                   is benign and frequent (e.g. acking a backlog id the
 *                   fast-checker already consumed).
 *  - `read_error` — an inflight entry was corrupt/unreadable; `file` names it.
 *                   This is NOT "not found": the message being acked may be
 *                   INSIDE that unreadable file, so the result is genuinely
 *                   unknown and the operator needs to know which file to inspect.
 */
export type AckResult =
  | { status: 'acked' }
  | { status: 'not_found' }
  | { status: 'read_error'; file: string };

/**
 * Acknowledge a message by moving it from inflight to processed.
 *
 * NEVER throws — it returns an {@link AckResult} instead, so callers that ignore
 * the value (e.g. the daemon fast-checker) keep their previous behavior, while
 * callers that care can avoid reporting a false success: a no-op ack that
 * silently "succeeds" makes the caller believe it attended a message it never
 * did.
 */
export function ackInbox(paths: BusPaths, messageId: string): AckResult {
  const { inflight, processed } = paths;
  ensureDir(processed);

  // Find the file in inflight that contains this message ID
  let files: string[];
  try {
    files = readdirSync(inflight).filter(f => f.endsWith('.json'));
  } catch (err) {
    // A missing inflight dir just means there is nothing to ack (benign). Any
    // other listing failure (e.g. permissions) is a real error worth surfacing.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'not_found' };
    return { status: 'read_error', file: inflight };
  }

  let unreadableFile: string | null = null;
  for (const file of files) {
    const filePath = join(inflight, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const msg = JSON.parse(content);
      if (msg.id === messageId) {
        renameSync(filePath, join(processed, file));
        return { status: 'acked' }; // found and acked
      }
    } catch {
      // Corrupt/unreadable inflight file. The message we were asked to ack may
      // be INSIDE it, so we can't honestly call this a clean "not found".
      // Remember the first such file to point the operator at what to inspect.
      if (unreadableFile === null) unreadableFile = file;
    }
  }
  return unreadableFile !== null
    ? { status: 'read_error', file: unreadableFile }
    : { status: 'not_found' };
}

/**
 * Recover stale inflight messages (older than thresholdSeconds) back to inbox.
 */
function recoverStaleInflight(
  inflightDir: string,
  inboxDir: string,
  thresholdSeconds: number,
): void {
  const now = Math.floor(Date.now() / 1000);
  let files: string[];
  try {
    files = readdirSync(inflightDir).filter(f => f.endsWith('.json'));
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = join(inflightDir, file);
    try {
      const stat = statSync(filePath);
      const mtime = Math.floor(stat.mtimeMs / 1000);
      if (now - mtime > thresholdSeconds) {
        renameSync(filePath, join(inboxDir, file));
      }
    } catch {
      // Ignore stat/move errors
    }
  }
}
