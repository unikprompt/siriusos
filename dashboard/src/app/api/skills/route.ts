import fs from 'fs';
import path from 'path';
import { getFrameworkRoot } from '@/lib/config';

export const dynamic = 'force-dynamic';

type SkillSource = 'core' | 'community';

const CATALOG_DIRS: Array<{ relPath: string; source: SkillSource }> = [
  { relPath: 'skills', source: 'core' },
  { relPath: path.join('community', 'skills'), source: 'community' },
];

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

function getInstalledAgents(frameworkRoot: string, slug: string): string[] {
  const installed: string[] = [];
  const orgsDir = path.join(frameworkRoot, 'orgs');
  if (!fs.existsSync(orgsDir)) return installed;

  for (const orgEntry of fs.readdirSync(orgsDir, { withFileTypes: true })) {
    if (!orgEntry.isDirectory()) continue;
    const agentsDir = path.join(orgsDir, orgEntry.name, 'agents');
    if (!fs.existsSync(agentsDir)) continue;
    for (const agentEntry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!agentEntry.isDirectory()) continue;
      const skillPath = path.join(agentsDir, agentEntry.name, 'skills', slug);
      if (fs.existsSync(skillPath)) {
        installed.push(`${orgEntry.name}/${agentEntry.name}`);
      }
    }
  }
  return installed;
}

/**
 * Resolve which catalog (and absolute path) holds a given skill slug.
 * `skills/` (core) takes precedence when a slug exists in both — symlinking
 * the same name to two different sources would be ambiguous, and core is the
 * canonical pool.
 */
function resolveSkillCatalog(
  frameworkRoot: string,
  slug: string,
): { absPath: string; source: SkillSource } | null {
  for (const { relPath, source } of CATALOG_DIRS) {
    const candidate = path.join(frameworkRoot, relPath, slug);
    if (fs.existsSync(candidate)) return { absPath: candidate, source };
  }
  return null;
}

export async function GET() {
  try {
    const frameworkRoot = getFrameworkRoot();
    const skillsBySlug = new Map<string, {
      slug: string;
      name: string;
      description: string;
      source: SkillSource;
      installed: boolean;
      installedFor: string[];
    }>();

    for (const { relPath, source } of CATALOG_DIRS) {
      const catalogDir = path.join(frameworkRoot, relPath);
      if (!fs.existsSync(catalogDir)) continue;

      for (const entry of fs.readdirSync(catalogDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const slug = entry.name;

        // Reserved names that aren't real skills:
        // - drafts/ holds in-progress agent-generated drafts (per agent), but
        //   if it ever ends up at the catalog root we skip it.
        // - archive/ same reasoning.
        if (slug === 'drafts' || slug === 'archive') continue;

        // Core wins when a slug is duplicated across catalogs.
        if (skillsBySlug.has(slug)) continue;

        const skillMd = path.join(catalogDir, slug, 'SKILL.md');
        const readme = path.join(catalogDir, slug, 'README.md');
        let content = '';
        if (fs.existsSync(skillMd)) content = fs.readFileSync(skillMd, 'utf-8');
        else if (fs.existsSync(readme)) content = fs.readFileSync(readme, 'utf-8');

        const { name, description } = parseSkillMd(content);
        const installedFor = getInstalledAgents(frameworkRoot, slug);

        skillsBySlug.set(slug, {
          slug,
          name: name || slug,
          description,
          source,
          installed: installedFor.length > 0,
          installedFor,
        });
      }
    }

    const skills = Array.from(skillsBySlug.values()).sort((a, b) => a.name.localeCompare(b.name));
    return Response.json(skills);
  } catch (err) {
    console.error('[api/skills] error:', err);
    return Response.json([]);
  }
}

// POST /api/skills - Install a skill to an agent
export async function POST(request: Request) {
  try {
    const { slug, org, agent } = await request.json();
    if (!slug || !org || !agent) {
      return Response.json({ error: 'slug, org, and agent required' }, { status: 400 });
    }

    const frameworkRoot = getFrameworkRoot();
    const resolved = resolveSkillCatalog(frameworkRoot, slug);
    if (!resolved) {
      return Response.json({ error: `Skill not found: ${slug}` }, { status: 404 });
    }

    const skillsDir = path.join(frameworkRoot, 'orgs', org, 'agents', agent, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const linkPath = path.join(skillsDir, slug);

    try { if (fs.lstatSync(linkPath).isSymbolicLink()) fs.unlinkSync(linkPath); } catch { /* doesn't exist */ }
    fs.symlinkSync(resolved.absPath, linkPath, 'dir');

    return Response.json({ success: true, source: resolved.source });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/skills - Uninstall a skill from an agent
export async function DELETE(request: Request) {
  try {
    const { slug, org, agent } = await request.json();
    if (!slug || !org || !agent) {
      return Response.json({ error: 'slug, org, and agent required' }, { status: 400 });
    }

    const frameworkRoot = getFrameworkRoot();
    const linkPath = path.join(frameworkRoot, 'orgs', org, 'agents', agent, 'skills', slug);

    try {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) fs.unlinkSync(linkPath);
      else if (stat.isDirectory()) fs.rmSync(linkPath, { recursive: true });
    } catch {
      return Response.json({ error: `Skill not installed: ${slug}` }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
