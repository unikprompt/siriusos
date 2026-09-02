import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { sendMessage, checkInbox, ackInbox } from '../../../src/bus/message';
import { resolvePaths } from '../../../src/utils/paths';
import type { BusPaths } from '../../../src/types';

describe('Message Bus', () => {
  let testDir: string;
  let senderPaths: BusPaths;
  let receiverPaths: BusPaths;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'cortextos-bus-test-'));
    // Override ctxRoot to use temp directory
    senderPaths = {
      ctxRoot: testDir,
      inbox: join(testDir, 'inbox', 'sender'),
      inflight: join(testDir, 'inflight', 'sender'),
      processed: join(testDir, 'processed', 'sender'),
      logDir: join(testDir, 'logs', 'sender'),
      stateDir: join(testDir, 'state', 'sender'),
      taskDir: join(testDir, 'tasks'),
      approvalDir: join(testDir, 'approvals'),
      analyticsDir: join(testDir, 'analytics'),
      heartbeatDir: join(testDir, 'heartbeats'),
    };
    receiverPaths = {
      ...senderPaths,
      inbox: join(testDir, 'inbox', 'receiver'),
      inflight: join(testDir, 'inflight', 'receiver'),
      processed: join(testDir, 'processed', 'receiver'),
      logDir: join(testDir, 'logs', 'receiver'),
      stateDir: join(testDir, 'state', 'receiver'),
    };
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('sendMessage', () => {
    it('creates a JSON file in receiver inbox', () => {
      const msgId = sendMessage(senderPaths, 'sender', 'receiver', 'normal', 'Hello');
      expect(msgId).toBeTruthy();

      const receiverInbox = join(testDir, 'inbox', 'receiver');
      const files = readdirSync(receiverInbox).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);

      // Verify filename format: {pnum}-{epochMs}-from-{sender}-{rand5}.json
      expect(files[0]).toMatch(/^2-\d+-from-sender-[a-z0-9]{5}\.json$/);
    });

    it('produces JSON matching bash format', () => {
      sendMessage(senderPaths, 'paul', 'boris', 'high', 'Build the page');

      const receiverInbox = join(testDir, 'inbox', 'boris');
      const files = readdirSync(receiverInbox).filter(f => f.endsWith('.json'));
      const content = JSON.parse(readFileSync(join(receiverInbox, files[0]), 'utf-8'));

      // Verify all fields match bash send-message.sh format
      expect(content).toHaveProperty('id');
      expect(content).toHaveProperty('from', 'paul');
      expect(content).toHaveProperty('to', 'boris');
      expect(content).toHaveProperty('priority', 'high');
      expect(content).toHaveProperty('timestamp');
      expect(content).toHaveProperty('text', 'Build the page');
      expect(content).toHaveProperty('reply_to', null);

      // Verify filename has priority 1 (high)
      expect(files[0]).toMatch(/^1-/);
    });

    it('encodes priority correctly in filename', () => {
      sendMessage(senderPaths, 'a', 'b', 'urgent', 'test');
      sendMessage(senderPaths, 'a', 'b', 'high', 'test');
      sendMessage(senderPaths, 'a', 'b', 'normal', 'test');
      sendMessage(senderPaths, 'a', 'b', 'low', 'test');

      const inbox = join(testDir, 'inbox', 'b');
      const files = readdirSync(inbox).filter(f => f.endsWith('.json')).sort();

      expect(files[0]).toMatch(/^0-/); // urgent
      expect(files[1]).toMatch(/^1-/); // high
      expect(files[2]).toMatch(/^2-/); // normal
      expect(files[3]).toMatch(/^3-/); // low
    });

    it('rejects invalid agent names', () => {
      expect(() =>
        sendMessage(senderPaths, '../bad', 'good', 'normal', 'test')
      ).toThrow();
    });

    it('rejects empty text (the pipe footgun) and writes nothing', () => {
      expect(() =>
        sendMessage(senderPaths, 'sender', 'receiver', 'normal', '')
      ).toThrow(/empty/i);

      // No message file leaked into the receiver inbox.
      const receiverInbox = join(testDir, 'inbox', 'receiver');
      let files: string[] = [];
      try { files = readdirSync(receiverInbox).filter(f => f.endsWith('.json')); } catch { /* dir may not exist */ }
      expect(files.length).toBe(0);
    });

    it('rejects whitespace-only text', () => {
      expect(() =>
        sendMessage(senderPaths, 'sender', 'receiver', 'normal', '   \n\t ')
      ).toThrow(/empty/i);
    });

    it('preserves leading/trailing whitespace on non-empty text (only the emptiness check trims)', () => {
      sendMessage(senderPaths, 'sender', 'receiver', 'normal', '  hi there  ');

      const receiverInbox = join(testDir, 'inbox', 'receiver');
      const files = readdirSync(receiverInbox).filter(f => f.endsWith('.json'));
      const content = JSON.parse(readFileSync(join(receiverInbox, files[0]), 'utf-8'));
      expect(content.text).toBe('  hi there  ');
    });
  });

  describe('checkInbox', () => {
    it('returns empty array for empty inbox', () => {
      const messages = checkInbox(receiverPaths);
      expect(messages).toEqual([]);
    });

    it('returns messages sorted by priority', () => {
      sendMessage(senderPaths, 'sender', 'receiver', 'low', 'low priority');
      sendMessage(senderPaths, 'sender', 'receiver', 'urgent', 'urgent');
      sendMessage(senderPaths, 'sender', 'receiver', 'normal', 'normal');

      const messages = checkInbox(receiverPaths);
      expect(messages.length).toBe(3);
      expect(messages[0].priority).toBe('urgent');
      expect(messages[1].priority).toBe('normal');
      expect(messages[2].priority).toBe('low');
    });

    it('moves messages to inflight', () => {
      sendMessage(senderPaths, 'sender', 'receiver', 'normal', 'test');
      checkInbox(receiverPaths);

      const inboxFiles = readdirSync(receiverPaths.inbox).filter(f => f.endsWith('.json'));
      const inflightFiles = readdirSync(receiverPaths.inflight).filter(f => f.endsWith('.json'));

      expect(inboxFiles.length).toBe(0);
      expect(inflightFiles.length).toBe(1);
    });
  });

  describe('ackInbox', () => {
    it('acks a real inflight message: moves it to processed and returns status "acked"', () => {
      const msgId = sendMessage(senderPaths, 'sender', 'receiver', 'normal', 'test');
      checkInbox(receiverPaths); // moves to inflight

      const result = ackInbox(receiverPaths, msgId);
      expect(result.status).toBe('acked');

      const inflightFiles = readdirSync(receiverPaths.inflight).filter(f => f.endsWith('.json'));
      const processedFiles = readdirSync(receiverPaths.processed).filter(f => f.endsWith('.json'));

      expect(inflightFiles.length).toBe(0);
      expect(processedFiles.length).toBe(1);
    });

    it('returns "not_found" (no false success) and moves nothing when the id is not in inflight', () => {
      // A real inflight message exists, but we ack a DIFFERENT id.
      sendMessage(senderPaths, 'sender', 'receiver', 'normal', 'test');
      checkInbox(receiverPaths); // moves the real message to inflight

      const result = ackInbox(receiverPaths, 'nonexistent-id-12345');
      expect(result.status).toBe('not_found');

      // The real message is untouched (still inflight, nothing processed).
      const inflightFiles = readdirSync(receiverPaths.inflight).filter(f => f.endsWith('.json'));
      const processedFiles = readdirSync(receiverPaths.processed).filter(f => f.endsWith('.json'));
      expect(inflightFiles.length).toBe(1);
      expect(processedFiles.length).toBe(0);
    });

    it('returns "not_found" when there is no inflight dir at all (benign no-op)', () => {
      const result = ackInbox(receiverPaths, 'anything');
      expect(result.status).toBe('not_found');
    });

    it('returns "read_error" naming the corrupt file when an inflight entry is unreadable', () => {
      // A readable message plus a corrupt one in inflight.
      sendMessage(senderPaths, 'sender', 'receiver', 'normal', 'test');
      checkInbox(receiverPaths); // moves the real message to inflight
      const corruptName = '2-9999999999999-from-sender-zzzzz.json';
      writeFileSync(join(receiverPaths.inflight, corruptName), '{ this is not valid json');

      // Ack an id that is not the readable message: since the target could be
      // INSIDE the corrupt file, the result must be read_error (not not_found),
      // and it must name the file the operator should inspect.
      const result = ackInbox(receiverPaths, 'some-other-id');
      expect(result.status).toBe('read_error');
      if (result.status === 'read_error') {
        expect(result.file).toBe(corruptName);
      }
    });
  });
});
