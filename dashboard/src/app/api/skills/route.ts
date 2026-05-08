import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { getFrameworkRoot, getAllAgents } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Skills catalog read-only endpoint.
 *
 * Source of truth: `<frameworkRoot>/community/skills/<slug>/SKILL.md`. We
 * scan that directory, parse the YAML frontmatter, and report `installedFor`
 * by asking the SiriusOS CLI which agents actually see the skill via
 * `siriusos bus list-skills` — the same path agents use at runtime, so the
 * answer reflects reality (community + template-embedded + agent-local
 * overrides) instead of stale dashboard symlinks.
 *
 * The previous POST/DELETE handlers wrote symlinks into
 * `agents/<agent>/skills/<slug>` which `bus list-skills` never read (it
 * scans `.claude/skills/`). They've been removed; the dashboard is now a
 * read-only viewer. Customising a skill for one agent is a CLI/filesystem
 * task, kept out of the UI.
 */

interface CliSkill { name: string; description: string; path: string; source: string }

function parseSkillMd(content: string): { name: string; description: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  let name = '';
  let description = '';
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const nm = fm.match(/^name:\s*(.+)$/m);
    const dm = fm.match(/^description:\s*(.+)$/m);
    if (nm) name = nm[1].trim().replace(/^["']|["']$/g, '');
    if (dm) description = dm[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!name) {
    const h = content.match(/^#\s+(.+)$/m);
    if (h) name = h[1].trim();
  }
  return { name: name || 'Unnamed Skill', description: description || '' };
}

/**
 * Spawn `siriusos bus list-skills --format json` for one agent and return
 * the slugs (skill names) it currently sees. Equivalent to what the agent
 * itself would see when it asks `bus list-skills` at session start.
 */
function listSkillsForAgent(frameworkRoot: string, org: string, agent: string): string[] {
  const cliPath = path.join(frameworkRoot, 'dist', 'cli.js');
  if (!fs.existsSync(cliPath)) return [];
  const agentDir = path.join(frameworkRoot, 'orgs', org, 'agents', agent);
  if (!fs.existsSync(agentDir)) return [];

  const result = spawnSync(process.execPath, [cliPath, 'bus', 'list-skills', '--format', 'json'], {
    cwd: frameworkRoot,
    encoding: 'utf-8',
    timeout: 5000,
    env: {
      ...process.env,
      CTX_FRAMEWORK_ROOT: frameworkRoot,
      CTX_AGENT_NAME: agent,
      CTX_AGENT_DIR: agentDir,
      CTX_ORG: org,
    },
  });

  if (result.status !== 0 || !result.stdout) return [];
  try {
    const parsed = JSON.parse(result.stdout) as CliSkill[];
    return parsed.map((s) => s.name);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const frameworkRoot = getFrameworkRoot();
    const catalogDir = path.join(frameworkRoot, 'community', 'skills');

    if (!fs.existsSync(catalogDir)) {
      return Response.json([]);
    }

    // Step 1: build the catalog by scanning community/skills/.
    type Skill = {
      slug: string;
      name: string;
      description: string;
      source: 'community';
      installedFor: string[];
    };
    const skills: Skill[] = [];

    for (const entry of fs.readdirSync(catalogDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const slug = entry.name;
      // drafts/ and archive/ are agent-local conventions; skip if they ever
      // appear at the catalog root.
      if (slug === 'drafts' || slug === 'archive') continue;

      const skillMd = path.join(catalogDir, slug, 'SKILL.md');
      const readme = path.join(catalogDir, slug, 'README.md');
      let content = '';
      if (fs.existsSync(skillMd)) content = fs.readFileSync(skillMd, 'utf-8');
      else if (fs.existsSync(readme)) content = fs.readFileSync(readme, 'utf-8');

      const { name, description } = parseSkillMd(content);
      skills.push({ slug, name: name || slug, description, source: 'community', installedFor: [] });
    }

    // Step 2: ask each agent which skills it actually sees, fill installedFor.
    // One spawn per agent is acceptable for fleets in the dozens. If this
    // ever scales past ~20 agents the spawn cost dominates and we'd cache
    // per-agent results, but at current size the latency is negligible.
    const skillByName = new Map<string, Skill>();
    for (const s of skills) skillByName.set(s.name, s);
    // Slugs and names usually match but the parsed YAML name wins; keep both
    // indexes so we don't miss a match.
    const skillBySlug = new Map<string, Skill>();
    for (const s of skills) skillBySlug.set(s.slug, s);

    const agents = getAllAgents();
    for (const { name: agent, org } of agents) {
      const seen = listSkillsForAgent(frameworkRoot, org, agent);
      for (const seenName of seen) {
        const target = skillByName.get(seenName) ?? skillBySlug.get(seenName);
        if (target) target.installedFor.push(`${org}/${agent}`);
      }
    }

    return Response.json(skills.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (err) {
    console.error('[api/skills] error:', err);
    return Response.json([]);
  }
}
