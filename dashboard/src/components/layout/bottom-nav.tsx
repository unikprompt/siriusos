'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOrg } from '@/hooks/use-org';
import {
  IconLayoutDashboard,
  IconListCheck,
  IconShieldCheck,
  IconChartDots3,
  IconDotsVertical,
  IconRobot,
  IconActivity,
  IconMessages,
  IconBook2,
  IconFlask,
  IconPuzzle,
  IconSettings,
  IconClock,
  IconTarget,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { DashboardStrings } from '@/lib/i18n';

type NavItemKey = keyof DashboardStrings['nav']['items'];

const mainTabs: Array<{ key: NavItemKey; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { key: 'overview', href: '/', icon: IconLayoutDashboard },
  { key: 'tasks', href: '/tasks', icon: IconListCheck },
  { key: 'approvals', href: '/approvals', icon: IconShieldCheck },
  { key: 'analytics', href: '/analytics', icon: IconChartDots3 },
];

const morePages: Array<{ key: NavItemKey; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { key: 'agents', href: '/agents', icon: IconRobot },
  { key: 'comms', href: '/comms', icon: IconMessages },
  { key: 'activity', href: '/activity', icon: IconActivity },
  { key: 'knowledgeBase', href: '/knowledge-base', icon: IconBook2 },
  { key: 'workflows', href: '/workflows', icon: IconClock },
  { key: 'strategy', href: '/strategy', icon: IconTarget },
  { key: 'experiments', href: '/experiments', icon: IconFlask },
  { key: 'skills', href: '/skills', icon: IconPuzzle },
  { key: 'settings', href: '/settings', icon: IconSettings },
];

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { currentOrg } = useOrg();
  const t = useT();

  function orgHref(href: string) {
    if (currentOrg && currentOrg !== 'all') {
      return `${href}${href.includes('?') ? '&' : '?'}org=${encodeURIComponent(currentOrg)}`;
    }
    return href;
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  const isMoreActive = morePages.some(p => isActive(p.href));

  return (
    <>
      {/* More menu sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-14 left-0 right-0 rounded-t-2xl bg-card border-t shadow-xl safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-medium">{t.nav.more}</span>
              <button onClick={() => setMoreOpen(false)} className="p-1 text-muted-foreground" aria-label={t.common.close}>
                <IconX size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 px-3 pb-4">
              {morePages.map((page) => {
                const Icon = page.icon;
                const active = isActive(page.href);
                return (
                  <Link
                    key={page.href}
                    href={orgHref(page.href)}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg py-3 transition-colors',
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <Icon size={22} strokeWidth={1.5} />
                    <span className="text-[10px] font-medium">{t.nav.items[page.key]}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-sm md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={orgHref(tab.href)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] font-medium">{t.nav.items[tab.key]}</span>
              </Link>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
              isMoreActive || moreOpen ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <IconDotsVertical size={20} strokeWidth={isMoreActive || moreOpen ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium">{t.nav.more}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
