'use client';

import { useTheme } from 'next-themes';
import { signOut, useSession } from 'next-auth/react';
import { IconSun, IconMoon, IconLogout, IconMenu2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OrgSelector } from './org-selector';
import { LocaleToggle } from '@/components/locale-toggle';
import { useT, useLocale } from '@/lib/i18n';

interface TopbarProps {
  orgs: string[];
  currentOrg: string;
  onOrgChange: (org: string) => void;
  onMenuClick?: () => void;
}

export function Topbar({ orgs, currentOrg, onOrgChange, onMenuClick }: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const t = useT();
  const { locale, setLocale, hydrated } = useLocale();

  const username = session?.user?.name ?? t.common.user;
  const initials = username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/75 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      {/* Left: Menu button (mobile) + mark + Org Selector */}
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="md:hidden h-9 w-9"
            aria-label={t.nav.openMenu}
          >
            <IconMenu2 size={18} />
          </Button>
        )}
        {/* Mobile-only mark to keep brand visible when sidebar collapsed */}
        <span
          className="md:hidden inline-flex h-7 w-7 items-center justify-center text-primary"
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 64 64" fill="currentColor">
            <path d="M 32 4 L 34 30 L 60 32 L 34 34 L 32 60 L 30 34 L 4 32 L 30 30 Z" />
          </svg>
        </span>
        <OrgSelector orgs={orgs} currentOrg={currentOrg} onOrgChange={onOrgChange} />
      </div>

      {/* Right: locale toggle + theme toggle + user menu */}
      <div className="flex items-center gap-1.5">
        <LocaleToggle locale={locale} onChange={setLocale} hydrated={hydrated} />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full transition-colors hover:bg-surface-2 hover:text-primary"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={t.nav.toggleTheme}
        >
          <IconSun
            size={16}
            className="rotate-0 scale-100 transition-transform duration-300 dark:-rotate-90 dark:scale-0"
          />
          <IconMoon
            size={16}
            className="absolute rotate-90 scale-0 transition-transform duration-300 dark:rotate-0 dark:scale-100"
          />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer">
            <Avatar size="sm" className="ring-2 ring-primary/20 transition-all hover:ring-primary/40">
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium">{username}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ redirectTo: '/login' })}>
              <IconLogout size={14} />
              <span>{t.nav.logout}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
