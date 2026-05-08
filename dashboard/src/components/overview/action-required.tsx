'use client';

import Link from 'next/link';
import {
  IconShield,
  IconAlertTriangle,
  IconHeartOff,
  IconChevronRight,
  IconCircleCheck,
  IconUser,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT, format } from '@/lib/i18n';

interface ActionRequiredProps {
  pendingApprovals: number;
  blockedTasks: number;
  staleAgents: number;
  humanTasks?: number;
}

interface ActionItem {
  icon: React.ReactNode;
  one: string;
  many: string;
  count: number;
  href: string;
}

export function ActionRequired({
  pendingApprovals,
  blockedTasks,
  staleAgents,
  humanTasks = 0,
}: ActionRequiredProps) {
  const t = useT();
  const totalActions = pendingApprovals + blockedTasks + staleAgents + humanTasks;

  const items: ActionItem[] = [
    {
      icon: <IconUser size={18} className="text-primary" />,
      one: t.pages.overview.actionItems.humanTaskOne,
      many: t.pages.overview.actionItems.humanTaskMany,
      count: humanTasks,
      href: '/tasks?agent=human',
    },
    {
      icon: <IconShield size={18} className="text-primary" />,
      one: t.pages.overview.actionItems.approvalOne,
      many: t.pages.overview.actionItems.approvalMany,
      count: pendingApprovals,
      href: '/approvals',
    },
    {
      icon: <IconAlertTriangle size={18} className="text-warning" />,
      one: t.pages.overview.actionItems.blockedOne,
      many: t.pages.overview.actionItems.blockedMany,
      count: blockedTasks,
      href: '/tasks?status=blocked',
    },
    {
      icon: <IconHeartOff size={18} className="text-destructive" />,
      one: t.pages.overview.actionItems.staleOne,
      many: t.pages.overview.actionItems.staleMany,
      count: staleAgents,
      href: '/agents',
    },
  ];

  return (
    <Card className="bg-muted/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t.pages.overview.actionRequired}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalActions === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-1">
            <IconCircleCheck size={18} className="text-success" />
            <span className="text-sm">{t.pages.overview.allClear}</span>
          </div>
        ) : (
          <div className="space-y-1">
            {items
              .filter((item) => item.count > 0)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-sm">
                      {format(item.count === 1 ? item.one : item.many, { count: item.count })}
                    </span>
                  </div>
                  <IconChevronRight
                    size={16}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </Link>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
