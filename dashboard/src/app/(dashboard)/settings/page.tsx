'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TelegramTab } from '@/components/settings/telegram-tab';
import { SystemTab } from '@/components/settings/system-tab';
import { UsersTab } from '@/components/settings/users-tab';
import { AllowedRootsTab } from '@/components/settings/allowed-roots-tab';
import { AppearanceTab } from '@/components/settings/appearance-tab';
import { OrganizationTab } from '@/components/settings/organization-tab';
import { useT } from '@/lib/i18n';

export default function SettingsPage() {
  const t = useT();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          {t.pages.settings.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.pages.settings.subtitle}
        </p>
      </div>

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization">{t.pages.settings.tabs.organization}</TabsTrigger>
          <TabsTrigger value="telegram">{t.pages.settings.tabs.telegram}</TabsTrigger>
          <TabsTrigger value="system">{t.pages.settings.tabs.system}</TabsTrigger>
          <TabsTrigger value="users">{t.pages.settings.tabs.users}</TabsTrigger>
          <TabsTrigger value="allowed-roots">{t.pages.settings.tabs.allowedRoots}</TabsTrigger>
          <TabsTrigger value="appearance">{t.pages.settings.tabs.appearance}</TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <div className="mt-4 max-w-2xl">
            <OrganizationTab />
          </div>
        </TabsContent>

        <TabsContent value="telegram">
          <div className="mt-4">
            <TelegramTab />
          </div>
        </TabsContent>

        <TabsContent value="system">
          <div className="mt-4 max-w-2xl">
            <SystemTab />
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="mt-4 max-w-2xl">
            <UsersTab />
          </div>
        </TabsContent>

        <TabsContent value="allowed-roots">
          <div className="mt-4 max-w-3xl">
            <AllowedRootsTab />
          </div>
        </TabsContent>

        <TabsContent value="appearance">
          <div className="mt-4 max-w-2xl">
            <AppearanceTab />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
