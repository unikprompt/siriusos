'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT, format } from '@/lib/i18n';

interface SkillInfo {
  slug: string;
  name: string;
  description: string;
  source?: 'core' | 'community';
  /** Agents that currently see this skill via `bus list-skills`. */
  installedFor: string[];
}

interface SkillCardProps {
  skill: SkillInfo;
}

export function SkillCard({ skill }: SkillCardProps) {
  const t = useT();
  const useCount = skill.installedFor.length;
  const usedByLabel = useCount === 1
    ? format(t.pages.skills.usedByOne, { count: useCount })
    : format(t.pages.skills.usedByMany, { count: useCount });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{skill.name}</CardTitle>
          {skill.source === 'community' && (
            <Badge variant="outline" className="border-accent/40 text-accent shrink-0">
              {t.pages.skills.sourceCommunity}
            </Badge>
          )}
        </div>
        <CardDescription>{skill.description}</CardDescription>
      </CardHeader>

      {useCount > 0 && (
        <CardContent>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-xs text-muted-foreground">
              {usedByLabel}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-medium mb-1">{t.pages.skills.usedByAgentsLabel}</p>
              <ul className="space-y-0.5 font-mono text-[11px]">
                {skill.installedFor.map((agent) => (
                  <li key={agent}>{agent}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </CardContent>
      )}
    </Card>
  );
}
