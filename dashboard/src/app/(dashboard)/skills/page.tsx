export const dynamic = 'force-dynamic';

import { getAllAgents } from '@/lib/config';
import { SkillsGrid } from '@/components/skills/skills-grid';
import { SkillsHeader } from '@/components/skills/skills-header';

export default function SkillsPage() {
  const agents = getAllAgents();

  return (
    <div className="space-y-6">
      <SkillsHeader />
      <SkillsGrid agents={agents} />
    </div>
  );
}
