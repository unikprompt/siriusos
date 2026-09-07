import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listAgents, inventoryAgents, notifyAgent, classifyIdentity } from '../../../src/bus/agents';
import { updateHeartbeat } from '../../../src/bus/heartbeat';
import type { BusPaths } from '../../../src/types';

describe('Agent Discovery', () => {
  let testDir: string;
  let ctxRoot: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'siriusos-agents-test-'));
    ctxRoot = testDir;
    // Point CTX_FRAMEWORK_ROOT at an isolated subdir (no orgs/ inside) so that
    // listAgents() sees a configured but empty framework root and does NOT fall
    // back to process.cwd() — which is the repo root and has a real orgs/ dir.
    process.env.CTX_FRAMEWORK_ROOT = join(testDir, 'framework');
    delete process.env.CTX_PROJECT_ROOT;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    // Clean up env vars
    delete process.env.CTX_FRAMEWORK_ROOT;
    delete process.env.CTX_PROJECT_ROOT;
  });

  describe('listAgents', () => {
    it('discovers agents from enabled-agents.json', () => {
      // Set up enabled-agents.json
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'enabled-agents.json'),
        JSON.stringify({
          boris: { org: 'acme', enabled: true },
          paul: { org: 'acme', enabled: true },
        }),
      );

      const agents = listAgents(ctxRoot);
      expect(agents.length).toBe(2);
      expect(agents.map(a => a.name).sort()).toEqual(['boris', 'paul']);
      expect(agents[0].org).toBe('acme');
      expect(agents[0].enabled).toBe(true);
    });

    it('reads IDENTITY.md first line for role', () => {
      // Set up framework root with agent identity
      const frameworkRoot = join(testDir, 'framework');
      process.env.CTX_FRAMEWORK_ROOT = frameworkRoot;

      const agentDir = join(frameworkRoot, 'orgs', 'testorg', 'agents', 'worker');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(
        join(agentDir, 'IDENTITY.md'),
        '# Worker Agent\n\n## Role\nBackend developer responsible for API implementation\n',
      );

      // Set up enabled-agents.json
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'enabled-agents.json'),
        JSON.stringify({ worker: { org: 'testorg', enabled: true } }),
      );

      const agents = listAgents(ctxRoot);
      expect(agents.length).toBe(1);
      expect(agents[0].role).toBe('Backend developer responsible for API implementation');
    });

    it('handles missing files gracefully', () => {
      // No config dir, no heartbeats - should return empty array
      const agents = listAgents(ctxRoot);
      expect(agents).toEqual([]);
    });

    it('handles missing IDENTITY.md gracefully', () => {
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'enabled-agents.json'),
        JSON.stringify({ agent1: { org: 'org1', enabled: true } }),
      );

      const agents = listAgents(ctxRoot);
      expect(agents.length).toBe(1);
      expect(agents[0].role).toBe('');
    });

    it('reads heartbeat data for status', () => {
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'enabled-agents.json'),
        JSON.stringify({ worker: { org: 'testorg', enabled: true } }),
      );

      // Write heartbeat to state dir (path: state/{agent}/heartbeat.json)
      const hbDir = join(ctxRoot, 'state', 'worker');
      mkdirSync(hbDir, { recursive: true });
      writeFileSync(
        join(hbDir, 'heartbeat.json'),
        JSON.stringify({
          agent: 'worker',
          timestamp: new Date().toISOString(),
          status: 'idle',
        }),
      );

      const agents = listAgents(ctxRoot);
      expect(agents.length).toBe(1);
      expect(agents[0].last_heartbeat).toBeTruthy();
      expect(agents[0].running).toBe(true); // Recent heartbeat means running
    });

    it('filters by org when specified', () => {
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'enabled-agents.json'),
        JSON.stringify({
          boris: { org: 'acme', enabled: true },
          other: { org: 'different', enabled: true },
        }),
      );

      const agents = listAgents(ctxRoot, 'acme');
      expect(agents.length).toBe(1);
      expect(agents[0].name).toBe('boris');
    });

    // BUG-028: daemon and CLI must agree on what's enabled.
    // Previously, listAgents short-circuited on enabled-agents.json existence,
    // hiding agents the daemon was actually running from `siriusos list-agents`.
    it('shows agents from dir scan even when enabled-agents.json exists', () => {
      // Set up: enabled-agents.json with one agent (alice), but TWO dirs on disk
      // (alice and bob). Previously listAgents would only return alice. After
      // the fix, both should be returned.
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'enabled-agents.json'),
        JSON.stringify({ alice: { org: 'acme', enabled: true } }),
      );

      const frameworkRoot = join(testDir, 'framework');
      process.env.CTX_FRAMEWORK_ROOT = frameworkRoot;
      mkdirSync(join(frameworkRoot, 'orgs', 'acme', 'agents', 'alice'), { recursive: true });
      mkdirSync(join(frameworkRoot, 'orgs', 'acme', 'agents', 'bob'), { recursive: true });

      const agents = listAgents(ctxRoot);
      expect(agents.map(a => a.name).sort()).toEqual(['alice', 'bob']);
    });

    it('respects enabled: false from enabled-agents.json for agents found in dir scan', () => {
      // Set up: dir for alice + entry in enabled-agents.json saying enabled: false.
      // listAgents should return alice with enabled: false (not skip her entirely).
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'enabled-agents.json'),
        JSON.stringify({ alice: { org: 'acme', enabled: false } }),
      );

      const frameworkRoot = join(testDir, 'framework');
      process.env.CTX_FRAMEWORK_ROOT = frameworkRoot;
      mkdirSync(join(frameworkRoot, 'orgs', 'acme', 'agents', 'alice'), { recursive: true });

      const agents = listAgents(ctxRoot);
      expect(agents.length).toBe(1);
      expect(agents[0].name).toBe('alice');
      expect(agents[0].enabled).toBe(false);
    });
  });

  describe('inventoryAgents', () => {
    // config.json presence is the reality check. Helpers mirror how the daemon
    // lays agents out on disk.
    function makeAgent(org: string, name: string, config: Record<string, unknown> = {}) {
      const dir = join(testDir, 'framework', 'orgs', org, 'agents', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
    }
    function setRegistry(obj: Record<string, { org?: string; enabled?: boolean }>) {
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'enabled-agents.json'), JSON.stringify(obj));
    }

    it('lists a real agent (config.json present, registry agrees) with no inconsistencies', () => {
      makeAgent('acme', 'alice', { enabled: true });
      setRegistry({ alice: { org: 'acme', enabled: true } });

      const inv = inventoryAgents(ctxRoot);
      expect(inv.agents.map(a => a.name)).toEqual(['alice']);
      expect(inv.agents[0].org).toBe('acme');
      expect(inv.agents[0].enabled).toBe(true);
      expect(inv.agents[0].inconsistencies).toBeUndefined();
      expect(inv.inconsistencies).toEqual([]);
    });

    it('excludes registry entries with no config.json and reports them as missing_config (FS-noise remedy: purge)', () => {
      // ".DS_Store" and a stale "ghost" both live only in the registry.
      setRegistry({ '.DS_Store': { enabled: true }, ghost: { org: 'acme', enabled: true } });

      const inv = inventoryAgents(ctxRoot);
      expect(inv.agents).toEqual([]);
      const flagged = inv.inconsistencies.filter(i => i.kind === 'missing_config').map(i => i.name).sort();
      expect(flagged).toEqual(['.DS_Store', 'ghost']);
    });

    it('reports an agents/ dir without config.json as missing_config, carrying its disk org', () => {
      mkdirSync(join(testDir, 'framework', 'orgs', 'acme', 'agents', 'stub'), { recursive: true });

      const inv = inventoryAgents(ctxRoot);
      expect(inv.agents).toEqual([]);
      const inc = inv.inconsistencies.find(i => i.name === 'stub');
      expect(inc?.kind).toBe('missing_config');
      expect(inc?.disk_org).toBe('acme');
    });

    it('uses the disk org (not the registry) and flags org_mismatch — the director case', () => {
      makeAgent('sirius-consul', 'director', { enabled: true });
      setRegistry({ director: { org: 'unikprompt', enabled: true } });

      const inv = inventoryAgents(ctxRoot);
      expect(inv.agents.length).toBe(1);
      expect(inv.agents[0].org).toBe('sirius-consul'); // disk truth, not the registry's 'unikprompt'
      const inc = inv.agents[0].inconsistencies?.find(i => i.kind === 'org_mismatch');
      expect(inc?.registry_org).toBe('unikprompt');
      expect(inc?.disk_org).toBe('sirius-consul');
      expect(inv.inconsistencies.some(i => i.kind === 'org_mismatch' && i.name === 'director')).toBe(true);
    });

    it('uses config enabled (not the registry) and flags enabled_mismatch — the sentinel case', () => {
      makeAgent('unikprompt', 'sentinel', { enabled: false });
      setRegistry({ sentinel: { org: 'unikprompt', enabled: true } });

      const inv = inventoryAgents(ctxRoot);
      expect(inv.agents.length).toBe(1);
      expect(inv.agents[0].enabled).toBe(false); // config.json is disk truth
      const inc = inv.agents[0].inconsistencies?.find(i => i.kind === 'enabled_mismatch');
      expect(inc?.registry_enabled).toBe(true);
      expect(inc?.config_enabled).toBe(false);
    });

    it('keeps the three kinds distinct so each gets its own remedy', () => {
      makeAgent('acme', 'good', { enabled: true });          // clean
      makeAgent('sirius-consul', 'director', { enabled: true }); // org_mismatch
      makeAgent('acme', 'sentinel', { enabled: false });     // enabled_mismatch
      setRegistry({
        good: { org: 'acme', enabled: true },
        director: { org: 'acme', enabled: true },   // registry says acme, disk says sirius-consul
        sentinel: { org: 'acme', enabled: true },   // registry enabled, config disabled
        phantom: { org: 'acme', enabled: true },    // no config.json anywhere
      });

      const inv = inventoryAgents(ctxRoot);
      expect(inv.agents.map(a => a.name).sort()).toEqual(['director', 'good', 'sentinel']);
      const byKind = inv.inconsistencies.reduce<Record<string, string[]>>((acc, i) => {
        (acc[i.kind] ||= []).push(i.name);
        return acc;
      }, {});
      expect(byKind.org_mismatch).toEqual(['director']);
      expect(byKind.enabled_mismatch).toEqual(['sentinel']);
      expect(byKind.missing_config).toEqual(['phantom']);
    });
  });

  describe('classifyIdentity', () => {
    // config.json under orgs/<org>/agents/<name>/ is the reality check.
    function makeAgent(org: string, name: string, config: Record<string, unknown> = {}) {
      const dir = join(testDir, 'framework', 'orgs', org, 'agents', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
    }
    function setRegistry(obj: Record<string, { org?: string; enabled?: boolean }>) {
      const configDir = join(ctxRoot, 'config');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'enabled-agents.json'), JSON.stringify(obj));
    }

    it("classifies an enabled agent with config.json as 'registered'", () => {
      makeAgent('acme', 'alice', { enabled: true });
      expect(classifyIdentity('alice', ctxRoot)).toBe('registered');
    });

    it("classifies a disabled agent that still has a config.json as 'disabled' (the orquestador-codex case)", () => {
      makeAgent('unikprompt', 'orquestador-codex', { enabled: false });
      expect(classifyIdentity('orquestador-codex', ctxRoot)).toBe('disabled');
    });

    it("classifies a name with no config.json anywhere as 'unregistered' (the vip-limo-voice-agent case)", () => {
      expect(classifyIdentity('vip-limo-voice-agent', ctxRoot)).toBe('unregistered');
    });

    it('is org-agnostic: an agent in its own org (son-de-nudos) is registered', () => {
      makeAgent('son-de-nudos', 'son-de-nudos', { enabled: true });
      expect(classifyIdentity('son-de-nudos', ctxRoot)).toBe('registered');
    });

    it('falls back to the registry when config.json has no enabled field', () => {
      makeAgent('acme', 'bob', {}); // no enabled key
      setRegistry({ bob: { org: 'acme', enabled: false } });
      expect(classifyIdentity('bob', ctxRoot)).toBe('disabled');
    });

    it('defaults to registered (daemon default-on) when neither config nor registry set enabled', () => {
      makeAgent('acme', 'carol', {});
      expect(classifyIdentity('carol', ctxRoot)).toBe('registered');
    });
  });

  describe('updateHeartbeat identity guard (mark, not block)', () => {
    function makeAgent(org: string, name: string, config: Record<string, unknown> = {}) {
      const dir = join(testDir, 'framework', 'orgs', org, 'agents', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
    }
    function pathsOf(agent: string): BusPaths {
      return {
        ctxRoot,
        inbox: join(ctxRoot, 'inbox', agent),
        inflight: join(ctxRoot, 'inflight', agent),
        processed: join(ctxRoot, 'processed', agent),
        logDir: join(ctxRoot, 'logs', agent),
        stateDir: join(ctxRoot, 'state', agent),
        taskDir: join(ctxRoot, 'tasks'),
        approvalDir: join(ctxRoot, 'approvals'),
        analyticsDir: join(ctxRoot, 'analytics'),
        heartbeatDir: join(ctxRoot, 'heartbeats'),
      };
    }
    function readHb(agent: string) {
      return JSON.parse(readFileSync(join(ctxRoot, 'state', agent, 'heartbeat.json'), 'utf-8'));
    }

    it('leaves a registered agent heartbeat untagged (byte-for-byte unchanged behavior)', () => {
      makeAgent('acme', 'alice', { enabled: true });
      updateHeartbeat(pathsOf('alice'), 'alice', 'online', { org: 'acme' });
      expect(readHb('alice').identity).toBeUndefined();
    });

    it('tags a foreign write (unregistered name) so read-all-heartbeats can separate it', () => {
      updateHeartbeat(pathsOf('vip-limo-voice-agent'), 'vip-limo-voice-agent', 'online', {});
      expect(readHb('vip-limo-voice-agent').identity).toBe('unregistered');
    });

    it('tags a disabled agent write (orquestador-codex reused by a foreign session)', () => {
      makeAgent('unikprompt', 'orquestador-codex', { enabled: false });
      updateHeartbeat(pathsOf('orquestador-codex'), 'orquestador-codex', 'online', {});
      expect(readHb('orquestador-codex').identity).toBe('disabled');
    });
  });

  describe('notifyAgent', () => {
    let paths: BusPaths;

    beforeEach(() => {
      paths = {
        ctxRoot,
        inbox: join(ctxRoot, 'inbox', 'sender'),
        inflight: join(ctxRoot, 'inflight', 'sender'),
        processed: join(ctxRoot, 'processed', 'sender'),
        logDir: join(ctxRoot, 'logs', 'sender'),
        stateDir: join(ctxRoot, 'state', 'sender'),
        taskDir: join(ctxRoot, 'tasks'),
        approvalDir: join(ctxRoot, 'approvals'),
        analyticsDir: join(ctxRoot, 'analytics'),
        heartbeatDir: join(ctxRoot, 'heartbeats'),
      };
    });

    it('creates signal file and bus message', () => {
      notifyAgent(paths, 'sender', 'target', 'Wake up!', ctxRoot);

      // Check signal file exists
      const signalFile = join(ctxRoot, 'state', 'target', '.urgent-signal');
      expect(existsSync(signalFile)).toBe(true);

      // Check bus message was sent
      const targetInbox = join(ctxRoot, 'inbox', 'target');
      expect(existsSync(targetInbox)).toBe(true);
      const files = require('fs').readdirSync(targetInbox).filter((f: string) => f.endsWith('.json'));
      expect(files.length).toBe(1);
    });

    it('signal file has correct JSON format', () => {
      notifyAgent(paths, 'boris', 'paul', 'New task available', ctxRoot);

      const signalFile = join(ctxRoot, 'state', 'paul', '.urgent-signal');
      const content = JSON.parse(readFileSync(signalFile, 'utf-8'));

      expect(content).toHaveProperty('from', 'boris');
      expect(content).toHaveProperty('message', 'New task available');
      expect(content).toHaveProperty('timestamp');
      // Verify timestamp is ISO 8601
      expect(new Date(content.timestamp).toISOString()).toBeTruthy();
    });

    it('creates state directory if it does not exist', () => {
      const stateDir = join(ctxRoot, 'state', 'newagent');
      expect(existsSync(stateDir)).toBe(false);

      notifyAgent(paths, 'sender', 'newagent', 'Hello', ctxRoot);

      expect(existsSync(stateDir)).toBe(true);
    });

    it('does NOT log telemetry when org is omitted', () => {
      notifyAgent(paths, 'sender', 'target', 'No org here', ctxRoot);
      const eventsDir = join(paths.analyticsDir, 'events', 'sender');
      expect(existsSync(eventsDir)).toBe(false);
    });

    it('logs an agent_steer event when org is provided', () => {
      notifyAgent(paths, 'sender', 'target', 'with telemetry', ctxRoot, 'acme');

      const eventsDir = join(paths.analyticsDir, 'events', 'sender');
      expect(existsSync(eventsDir)).toBe(true);
      const today = new Date().toISOString().split('T')[0];
      const eventFile = join(eventsDir, `${today}.jsonl`);
      expect(existsSync(eventFile)).toBe(true);
      const lines = readFileSync(eventFile, 'utf-8').trim().split('\n');
      expect(lines.length).toBe(1);
      const evt = JSON.parse(lines[0]);
      expect(evt.category).toBe('message');
      expect(evt.event).toBe('agent_steer');
      expect(evt.severity).toBe('info');
      expect(evt.agent).toBe('sender');
      expect(evt.org).toBe('acme');
      expect(evt.metadata.to).toBe('target');
      expect(evt.metadata.from).toBe('sender');
      expect(evt.metadata.priority).toBe('urgent');
      expect(typeof evt.metadata.message_id).toBe('string');
    });
  });
});
