import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AgentInfo, AgentConfig, BusPaths, AgentInventory, AgentInconsistency, IdentityStatus } from '../types/index.js';
import { atomicWriteSync, ensureDir } from '../utils/atomic.js';
import { sendMessage } from './message.js';
import { logEvent } from './event.js';

/**
 * List all agents in the system.
 *
 * Merges two sources of truth:
 *   1. The framework directory scan (`${CTX_FRAMEWORK_ROOT}/orgs/<org>/agents/`)
 *      — this is what the daemon discovers and runs.
 *   2. `enabled-agents.json` — explicit user-set enable/disable state from
 *      `siriusos enable`/`disable` and the dashboard.
 *
 * BUG-028: previously this function treated `enabled-agents.json` as
 * authoritative — if the file existed, the directory scan was skipped, causing
 * `siriusos list-agents` to miss agents that the daemon was actually running.
 * Now both sources are always merged, with the file providing the explicit
 * enabled flag and the directory scan providing the canonical existence check.
 */
export function listAgents(ctxRoot: string, org?: string): AgentInfo[] {
  const agents: AgentInfo[] = [];
  const seen = new Set<string>();

  // 1. Read enabled-agents.json for explicit enable/disable state.
  // This is treated as metadata, not as the list of agents to display.
  const enabledFile = join(ctxRoot, 'config', 'enabled-agents.json');
  let enabledAgents: Record<string, { org?: string; enabled?: boolean }> = {};
  if (existsSync(enabledFile)) {
    try {
      enabledAgents = JSON.parse(readFileSync(enabledFile, 'utf-8'));
    } catch {
      // Skip corrupt file — fall through to directory scan only.
    }
  }

  // 2. ALWAYS scan org agent directories (BUG-028 fix).
  // The directory scan is now the primary source for "what agents exist".
  // The enabled-agents.json entries are merged in as metadata.
  const cliProjectRoot = process.env.CTX_FRAMEWORK_ROOT;
  const scanRoots: string[] = [];
  if (cliProjectRoot && existsSync(join(cliProjectRoot, 'orgs'))) {
    scanRoots.push(cliProjectRoot);
  }
  // Fallback: cwd, but ONLY when CTX_FRAMEWORK_ROOT is completely unset.
  // If CTX_FRAMEWORK_ROOT is set (even to a path without orgs/), respect it and
  // do not scan cwd — the caller explicitly configured a root that has no agents.
  // This prevents test contamination when cwd happens to be the framework repo.
  if (scanRoots.length === 0 && !cliProjectRoot) {
    const cwd = process.cwd();
    if (existsSync(join(cwd, 'orgs'))) {
      scanRoots.push(cwd);
    }
  }

  for (const root of scanRoots) {
    const orgsDir = join(root, 'orgs');
    if (!existsSync(orgsDir)) continue;

    let orgDirs: string[];
    try {
      orgDirs = readdirSync(orgsDir);
    } catch {
      continue;
    }

    for (const orgName of orgDirs) {
      if (org && orgName !== org) continue;

      const agentsDir = join(orgsDir, orgName, 'agents');
      if (!existsSync(agentsDir)) continue;

      let agentDirs: string[];
      try {
        agentDirs = readdirSync(agentsDir);
      } catch {
        continue;
      }

      for (const agentName of agentDirs) {
        if (!/^[a-z0-9_-]+$/.test(agentName)) continue;
        if (seen.has(agentName)) continue;

        seen.add(agentName);

        // Determine enabled state: explicit from enabled-agents.json if present,
        // otherwise default to enabled (matches the daemon's discoverAndStart
        // default-on behavior).
        const explicitEntry = enabledAgents[agentName];
        const isEnabled = explicitEntry ? explicitEntry.enabled !== false : true;

        agents.push(buildAgentInfo(agentName, orgName, isEnabled, ctxRoot));
      }
    }
  }

  // 3. Append any entries from enabled-agents.json that don't have a corresponding
  // directory on disk (stale registrations — file has them but the dir was deleted
  // or never existed). These are surfaced so users can clean them up.
  for (const [name, cfg] of Object.entries(enabledAgents)) {
    if (!/^[a-z0-9_-]+$/.test(name)) continue;
    if (seen.has(name)) continue;
    const agentOrg = cfg.org || '';
    if (org && agentOrg !== org) continue;
    seen.add(name);
    agents.push(buildAgentInfo(name, agentOrg, cfg.enabled !== false, ctxRoot));
  }

  return agents;
}

/**
 * Reliable agent inventory: what is ACTUALLY on disk, plus the registry
 * discrepancies, reported rather than hidden.
 *
 * Unlike listAgents() (which surfaces every enabled-agents.json entry and every
 * agents/ subdirectory so nothing the daemon might touch is missed), this treats
 * the presence of `orgs/<org>/agents/<name>/config.json` as the reality check
 * for "is this a real agent". Consequences:
 *   - an agent's `org` is where its config.json actually lives on disk, not what
 *     the registry claims (fixes `director` showing the wrong org);
 *   - a registry entry (or an agents/ dir) with no config.json is NOT listed as
 *     an agent — it is reported as a `missing_config` inconsistency instead
 *     (fixes `.DS_Store` and stale registrations appearing as agents);
 *   - registry-vs-config `org_mismatch` and `enabled_mismatch` are flagged on
 *     the agent (and in the inconsistency list) rather than silently resolved.
 *
 * The three `kind`s stay distinct because each has a different remedy — see
 * AgentInconsistency. This function does NOT autocorrect anything; it reports.
 */
export function inventoryAgents(ctxRoot: string, org?: string): AgentInventory {
  const agents: AgentInfo[] = [];
  const inconsistencies: AgentInconsistency[] = [];
  const seen = new Set<string>();

  // Registry (enabled-agents.json) — metadata to cross-check against disk.
  const enabledFile = join(ctxRoot, 'config', 'enabled-agents.json');
  let registry: Record<string, { org?: string; enabled?: boolean }> = {};
  if (existsSync(enabledFile)) {
    try {
      registry = JSON.parse(readFileSync(enabledFile, 'utf-8'));
    } catch {
      // Corrupt registry — fall through to the disk scan only.
    }
  }

  // Same scan-root resolution as listAgents(): prefer CTX_FRAMEWORK_ROOT, fall
  // back to cwd ONLY when it is completely unset (avoids test contamination).
  const cliProjectRoot = process.env.CTX_FRAMEWORK_ROOT;
  const scanRoots: string[] = [];
  if (cliProjectRoot && existsSync(join(cliProjectRoot, 'orgs'))) {
    scanRoots.push(cliProjectRoot);
  }
  if (scanRoots.length === 0 && !cliProjectRoot) {
    const cwd = process.cwd();
    if (existsSync(join(cwd, 'orgs'))) scanRoots.push(cwd);
  }

  // Disk scan: config.json is the reality check for "real agent". Collect every
  // on-disk agent GROUPED BY NAME across orgs, so a duplicate name (e.g.
  // `analista` in both unikprompt and sirius-consul) is resolved deliberately by
  // the registry below, not by whichever org readdir happens to return first.
  type DiskEntry = { orgName: string; configEnabled: boolean | undefined };
  const diskByName = new Map<string, DiskEntry[]>();
  for (const root of scanRoots) {
    const orgsDir = join(root, 'orgs');
    if (!existsSync(orgsDir)) continue;

    let orgDirs: string[];
    try {
      orgDirs = readdirSync(orgsDir);
    } catch {
      continue;
    }

    for (const orgName of orgDirs) {
      if (org && orgName !== org) continue;
      const agentsDir = join(orgsDir, orgName, 'agents');
      if (!existsSync(agentsDir)) continue;

      let agentDirs: string[];
      try {
        agentDirs = readdirSync(agentsDir);
      } catch {
        continue;
      }

      for (const agentName of agentDirs) {
        // Filesystem noise (`.DS_Store`, etc.) never matches a valid agent name.
        if (!/^[a-z0-9_-]+$/.test(agentName)) continue;

        const configPath = join(agentsDir, agentName, 'config.json');
        if (!existsSync(configPath)) {
          // A dir with no config.json is not a runnable agent — report, skip.
          inconsistencies.push({
            kind: 'missing_config',
            name: agentName,
            message: `agents/${agentName} under org '${orgName}' has no config.json`,
            disk_org: orgName,
          });
          continue;
        }

        // config.json is disk truth for enabled; cross-check the registry below.
        let configEnabled: boolean | undefined;
        try {
          const cfg: AgentConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
          configEnabled = cfg.enabled;
        } catch {
          // Corrupt config — treat enabled as unknown; buildAgentInfo re-reads it.
        }

        const list = diskByName.get(agentName) ?? [];
        list.push({ orgName, configEnabled });
        diskByName.set(agentName, list);
      }
    }
  }

  // Resolve each name to the entr(y|ies) to list. The registry decides the
  // canonical org for a duplicate name: if the registered org has a config on
  // disk, that entry wins and the homonym is dropped (no false org_mismatch).
  // Only when the registry has no home for the name do we surface one entry per
  // org rather than silently pick one by readdir order.
  for (const [agentName, entries] of diskByName) {
    seen.add(agentName);
    const reg = registry[agentName];
    const regEntry = reg && reg.org ? entries.find((e) => e.orgName === reg.org) : undefined;
    const chosen = regEntry ? [regEntry] : entries;
    const registryEnabled = reg ? reg.enabled !== false : undefined;

    for (const entry of chosen) {
      const agentInc: AgentInconsistency[] = [];

      // org_mismatch ONLY when the registry names an org that has NO config on
      // disk yet the agent lives under a different org (a real move/stale
      // registry) — never for a homonym whose registered org is present.
      if (reg && reg.org && !regEntry && reg.org !== entry.orgName) {
        agentInc.push({
          kind: 'org_mismatch',
          name: agentName,
          message: `registry org '${reg.org}' has no config on disk; found under '${entry.orgName}'`,
          registry_org: reg.org,
          disk_org: entry.orgName,
        });
      }

      if (registryEnabled !== undefined && entry.configEnabled !== undefined && registryEnabled !== entry.configEnabled) {
        agentInc.push({
          kind: 'enabled_mismatch',
          name: agentName,
          message: `registry enabled=${registryEnabled} != config enabled=${entry.configEnabled}`,
          registry_enabled: registryEnabled,
          config_enabled: entry.configEnabled,
        });
      }

      // Disk config is authoritative for enabled; fall back to the registry,
      // then default-on (matches the daemon's discoverAndStart behavior).
      const enabled = entry.configEnabled !== undefined
        ? entry.configEnabled
        : (reg ? reg.enabled !== false : true);

      const info = buildAgentInfo(agentName, entry.orgName, enabled, ctxRoot);
      if (agentInc.length > 0) info.inconsistencies = agentInc;
      agents.push(info);
      inconsistencies.push(...agentInc);
    }
  }

  // Registry entries with no matching config.json anywhere on disk: stale
  // registrations (deleted agent, wrong instance) or plain noise. Reported, not
  // listed as agents.
  for (const [name, cfg] of Object.entries(registry)) {
    if (seen.has(name)) continue;
    const registryOrg = cfg.org || '';
    if (org && registryOrg !== org) continue;
    seen.add(name);
    inconsistencies.push({
      kind: 'missing_config',
      name,
      message: `registry entry '${name}' (org '${registryOrg || '?'}') has no config.json on disk`,
      registry_org: registryOrg,
    });
  }

  return { agents, inconsistencies };
}

/**
 * Classify a write identity (CTX_AGENT_NAME) against disk truth, so the bus can
 * MARK — not block — writes that came from an identity it cannot confirm as an
 * active agent of ours (e.g. another of Mario's Codex projects reusing the name
 * `orquestador-codex`, or `vip-limo-voice-agent` with no home here at all).
 *
 * The reality check is `orgs/<org>/agents/<name>/config.json` (the same check
 * inventoryAgents uses), scanned across ALL orgs so it is org-agnostic —
 * `son-de-nudos` lives in its own org but is ours and classifies as
 * `registered` as long as it has a config.json and is enabled.
 *
 *   - registered:   config.json exists AND enabled (config wins, else registry,
 *                   else default-on, matching the daemon's discoverAndStart).
 *   - disabled:     config.json exists but enabled === false.
 *   - unregistered: no config.json under any org.
 *
 * ctxRoot locates the registry (config/enabled-agents.json); CTX_FRAMEWORK_ROOT
 * (with the cwd fallback, as in listAgents) locates orgs/.
 */
export function classifyIdentity(name: string, ctxRoot: string): IdentityStatus {
  const cliProjectRoot = process.env.CTX_FRAMEWORK_ROOT;
  const scanRoots: string[] = [];
  if (cliProjectRoot && existsSync(join(cliProjectRoot, 'orgs'))) {
    scanRoots.push(cliProjectRoot);
  }
  if (scanRoots.length === 0 && !cliProjectRoot) {
    const cwd = process.cwd();
    if (existsSync(join(cwd, 'orgs'))) scanRoots.push(cwd);
  }

  // Registry (enabled-agents.json): gives this identity's registered org and
  // enabled flag. Used to resolve the home org when CTX_ORG is unset, and as the
  // enabled fallback below.
  let registryOrg: string | undefined;
  let registryEnabled: boolean | undefined;
  const enabledFile = join(ctxRoot, 'config', 'enabled-agents.json');
  if (existsSync(enabledFile)) {
    try {
      const reg = (JSON.parse(readFileSync(enabledFile, 'utf-8')) as Record<string, { org?: string; enabled?: boolean }>)[name];
      if (reg) {
        registryOrg = reg.org;
        registryEnabled = reg.enabled !== false;
      }
    } catch {
      // Corrupt registry — ignore.
    }
  }

  // (org, name) is the primary key: resolve THIS identity's own home org first —
  // CTX_ORG (the caller's org), else the registry's org — so a homonym in another
  // org (e.g. sirius-consul's `analista`) never shadows ours by readdir order.
  // Only when no config exists under the home org do we scan all orgs, which is
  // what correctly classifies a genuinely foreign writer as unregistered.
  const homeOrg = process.env.CTX_ORG || registryOrg;
  let configPath: string | undefined;
  if (homeOrg) {
    for (const root of scanRoots) {
      const p = join(root, 'orgs', homeOrg, 'agents', name, 'config.json');
      if (existsSync(p)) {
        configPath = p;
        break;
      }
    }
  }
  if (!configPath) {
    for (const root of scanRoots) {
      const orgsDir = join(root, 'orgs');
      if (!existsSync(orgsDir)) continue;
      let orgDirs: string[];
      try {
        orgDirs = readdirSync(orgsDir);
      } catch {
        continue;
      }
      for (const org of orgDirs) {
        const p = join(orgsDir, org, 'agents', name, 'config.json');
        if (existsSync(p)) {
          configPath = p;
          break;
        }
      }
      if (configPath) break;
    }
  }

  if (!configPath) return 'unregistered';

  let configEnabled: boolean | undefined;
  try {
    configEnabled = (JSON.parse(readFileSync(configPath, 'utf-8')) as AgentConfig).enabled;
  } catch {
    // Corrupt config — treat enabled as unknown (fall through to registry/default).
  }

  const enabled = configEnabled !== undefined
    ? configEnabled
    : (registryEnabled !== undefined ? registryEnabled : true);

  return enabled ? 'registered' : 'disabled';
}

/**
 * Build an AgentInfo object by reading heartbeat, IDENTITY.md, and config.
 */
function buildAgentInfo(
  name: string,
  org: string,
  enabled: boolean,
  ctxRoot: string,
): AgentInfo {
  // Read heartbeat from state dir (bash uses state/{agent}/heartbeat.json)
  let lastHeartbeat: string | null = null;
  let currentTask: string | null = null;
  let mode: string | null = null;
  let running = false;

  const stateHeartbeat = join(ctxRoot, 'state', name, 'heartbeat.json');
  if (existsSync(stateHeartbeat)) {
    try {
      const hb = JSON.parse(readFileSync(stateHeartbeat, 'utf-8'));
      lastHeartbeat = hb.last_heartbeat || hb.timestamp || null;
      currentTask = hb.current_task || null;
      mode = hb.mode || null;
      // Running = heartbeat written within last 10 minutes
      if (lastHeartbeat) {
        const age = Date.now() - new Date(lastHeartbeat).getTime();
        running = age < 10 * 60 * 1000;
      }
    } catch {
      // Skip corrupt
    }
  }

  // Get display name and role from IDENTITY.md
  let role = '';
  let displayName: string | undefined;
  const frameworkRoot = process.env.CTX_FRAMEWORK_ROOT || process.env.CTX_PROJECT_ROOT || '';
  if (frameworkRoot) {
    const identityPaths = [
      join(frameworkRoot, 'orgs', org, 'agents', name, 'IDENTITY.md'),
      join(frameworkRoot, 'agents', name, 'IDENTITY.md'),
    ];
    for (const idPath of identityPaths) {
      if (existsSync(idPath)) {
        try {
          const content = readFileSync(idPath, 'utf-8');
          const lines = content.split('\n');

          // Parse "## Name" — user-configured display name (e.g. "Alpha", "Beta")
          const nameIdx = lines.findIndex(l => l.trim() === '## Name');
          if (nameIdx >= 0) {
            for (let i = nameIdx + 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line || line.startsWith('<!--')) continue;
              if (line.startsWith('##')) break;
              displayName = line;
              break;
            }
          }

          // Find "## Role" then take the first non-empty, non-comment line after it
          const roleIdx = lines.findIndex(l => l.startsWith('## Role'));
          if (roleIdx >= 0) {
            for (let i = roleIdx + 1; i < lines.length; i++) {
              const line = lines[i].trim();
              // Skip empty lines and HTML comment placeholders
              if (!line || line.startsWith('<!--') || line.startsWith('##')) break;
              role = line;
              break;
            }
          }
          // Fallback: first non-comment, non-heading line
          if (!role) {
            for (const line of lines) {
              const t = line.trim();
              if (t && !t.startsWith('#') && !t.startsWith('<!--')) {
                role = t;
                break;
              }
            }
          }
        } catch {
          // Skip
        }
        break;
      }
    }
  }

  // Read config.json for model info
  const configFrameworkRoot = process.env.CTX_FRAMEWORK_ROOT || process.env.CTX_PROJECT_ROOT || '';
  if (configFrameworkRoot) {
    const configPaths = [
      join(configFrameworkRoot, 'orgs', org, 'agents', name, 'config.json'),
      join(configFrameworkRoot, 'agents', name, 'config.json'),
    ];
    for (const cfgPath of configPaths) {
      if (existsSync(cfgPath)) {
        try {
          const cfg: AgentConfig = JSON.parse(readFileSync(cfgPath, 'utf-8'));
          if (cfg.enabled !== undefined) enabled = cfg.enabled;
        } catch {
          // Skip
        }
        break;
      }
    }
  }

  return {
    name,
    org,
    display_name: displayName,
    role,
    enabled,
    running,
    last_heartbeat: lastHeartbeat,
    current_task: currentTask,
    mode,
  };
}

/**
 * Send an urgent notification to an agent.
 * Writes .urgent-signal file and sends a bus message.
 * Mirrors bash notify-agent.sh behavior.
 *
 * If `org` is provided, also logs a `message`/`agent_steer` event so the
 * dashboard's Activity feed can show operator/agent interrupts as a
 * distinct stream from regular inbox traffic. Without `org`, the urgent
 * signal still fires; only the analytics event is skipped.
 */
export function notifyAgent(
  paths: BusPaths,
  from: string,
  targetAgent: string,
  message: string,
  ctxRoot: string,
  org?: string,
): void {
  // Write signal file to state dir
  const signalDir = join(ctxRoot, 'state', targetAgent);
  ensureDir(signalDir);

  const signal = {
    from,
    message,
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };

  atomicWriteSync(join(signalDir, '.urgent-signal'), JSON.stringify(signal));

  // Also send via normal message bus for persistence
  let msgId: string | undefined;
  try {
    msgId = sendMessage(paths, from, targetAgent, 'urgent', message);
  } catch {
    // Ignore bus send failures - signal file is the primary mechanism
  }

  if (org) {
    try {
      logEvent(paths, from, org, 'message', 'agent_steer', 'info', {
        to: targetAgent,
        from,
        priority: 'urgent',
        ...(msgId ? { message_id: msgId } : {}),
      });
    } catch {
      // Telemetry failure must not break the urgent-signal path.
    }
  }
}
