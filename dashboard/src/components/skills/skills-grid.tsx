'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SkillCard } from '@/components/skills/skill-card';
import { useT, format } from '@/lib/i18n';

interface SkillInfo {
  slug: string;
  name: string;
  description: string;
  source?: 'core' | 'community';
  installedFor: string[];
}

interface InUseSkill {
  name: string;
  source: string; // 'community' | 'agent' | 'template:<x>' | 'framework'
}

interface InUseResponse {
  agent: string;
  org: string;
  skills: InUseSkill[];
}

interface SkillsGridProps {
  agents: Array<{ name: string; org: string }>;
}

export function SkillsGrid({ agents }: SkillsGridProps) {
  const t = useT();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>(
    agents.length > 0 ? `${agents[0].org}/${agents[0].name}` : '',
  );
  const [inUseSkills, setInUseSkills] = useState<InUseSkill[]>([]);
  const [inUseLoading, setInUseLoading] = useState(false);

  const loadSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setSkills(data);
    } catch {
      setSkills([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Fetch the in-use list whenever the selected agent changes.
  useEffect(() => {
    if (!selectedAgent) {
      setInUseSkills([]);
      return;
    }
    const [org, name] = selectedAgent.split('/');
    if (!org || !name) return;
    setInUseLoading(true);
    fetch(`/api/skills/in-use?org=${encodeURIComponent(org)}&agent=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data: InUseResponse | { error: string }) => {
        if ('skills' in data) setInUseSkills(data.skills);
        else setInUseSkills([]);
      })
      .catch(() => setInUseSkills([]))
      .finally(() => setInUseLoading(false));
  }, [selectedAgent]);

  const community = useMemo(() => skills.filter((s) => s.source === 'community'), [skills]);

  const inUseAgentName = selectedAgent.split('/')[1] ?? '';

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        <p>{t.pages.skills.empty}</p>
        <p className="text-xs mt-1">{t.pages.skills.emptyHint}</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="all">
      <TabsList>
        <TabsTrigger value="all">{t.pages.skills.tabs.all} ({skills.length})</TabsTrigger>
        <TabsTrigger value="community">{t.pages.skills.tabs.community} ({community.length})</TabsTrigger>
        <TabsTrigger value="in-use">{t.pages.skills.tabs.inUse}</TabsTrigger>
      </TabsList>

      <TabsContent value="all">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
          {skills.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="community">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
          {community.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="in-use">
        <div className="mt-4 space-y-4">
          {agents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t.pages.skills.noAgentsYet}
            </p>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Label htmlFor="agent-picker" className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                  {t.pages.skills.agentSelector}
                </Label>
                <Select value={selectedAgent} onValueChange={(v) => setSelectedAgent(v ?? '')}>
                  <SelectTrigger id="agent-picker" className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => {
                      const key = `${a.org}/${a.name}`;
                      return (
                        <SelectItem key={key} value={key}>
                          {key}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground sm:ml-auto">
                  {t.pages.skills.pickAgent}
                </p>
              </div>

              {inUseLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
                  ))}
                </div>
              ) : inUseSkills.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {format(t.pages.skills.inUseEmpty, { agent: inUseAgentName })}
                </p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {inUseSkills.map((s) => {
                    const sourceLabel =
                      s.source === 'community' ? t.pages.skills.sourceCommunity :
                      s.source === 'agent' ? t.pages.skills.sourceAgent :
                      s.source.startsWith('template:') ? `${t.pages.skills.sourceTemplate}` :
                      s.source;
                    return (
                      <li
                        key={s.name}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                      >
                        <span className="font-medium truncate">{s.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {sourceLabel}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
