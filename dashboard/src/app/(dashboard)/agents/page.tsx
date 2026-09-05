import { discoverAgents } from '@/lib/data/agents';
import { AgentsGrid } from '@/components/agents/agents-grid';
import { AgentsHeader } from '@/components/agents/agents-header';
import type { AgentCardData } from '@/components/agents/agent-card';
import { IPCClient } from '@/lib/ipc-client';

export const dynamic = 'force-dynamic';

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const orgFilter = typeof params.org === 'string' ? params.org : undefined;

  const [raw, runningNames] = await Promise.all([
    discoverAgents(orgFilter),
    (async () => {
      try {
        const ipc = new IPCClient(process.env.CTX_INSTANCE_ID ?? 'default');
        const result = await ipc.send({ type: 'list-agents' });
        return new Set(result.success && Array.isArray(result.data) ? result.data as string[] : []);
      } catch {
        return new Set<string>();
      }
    })(),
  ]);

  const agents: AgentCardData[] = raw.map((a) => ({
    name: a.name,
    systemName: (a as unknown as Record<string, string>).systemName ?? a.name,
    org: a.org,
    emoji: (a as unknown as Record<string, string>).emoji ?? '',
    role: (a as unknown as Record<string, string>).role ?? '',
    health: a.health,
    currentTask: a.currentTask,
    tasksToday: (a as unknown as Record<string, number>).tasksToday ?? 0,
    runtime: a.runtime,
    running: runningNames.has((a as unknown as Record<string, string>).systemName ?? a.name),
  }));

  return (
    <div className="space-y-6">
      <AgentsHeader org={orgFilter} count={agents.length} />
      <AgentsGrid initialAgents={agents} />
    </div>
  );
}
