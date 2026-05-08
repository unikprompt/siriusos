import { getOrgs, getFrameworkRoot } from '@/lib/config';
import { KnowledgeBaseClient } from '@/components/knowledge-base/kb-client';
import { KnowledgeBaseHeader } from '@/components/knowledge-base/kb-header';
import fs from 'fs';
import path from 'path';

function getKnowledgeContent(org: string): string {
  const frameworkRoot = getFrameworkRoot();
  const kbPath = path.join(frameworkRoot, 'orgs', org, 'knowledge.md');
  try {
    if (fs.existsSync(kbPath)) {
      return fs.readFileSync(kbPath, 'utf-8');
    }
  } catch {
    // graceful fallback
  }
  return '';
}

export const dynamic = 'force-dynamic';

export default function KnowledgeBasePage() {
  const orgs = getOrgs();
  const org = orgs[0] ?? '';
  const content = org ? getKnowledgeContent(org) : '';
  const kbPath = org
    ? path.join(getFrameworkRoot(), 'orgs', org, 'knowledge.md')
    : '';

  return (
    <div className="space-y-6">
      <KnowledgeBaseHeader />
      <KnowledgeBaseClient
        org={org}
        markdownContent={content}
        filePath={kbPath}
      />
    </div>
  );
}
