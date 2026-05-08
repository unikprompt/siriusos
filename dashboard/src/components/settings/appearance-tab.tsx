'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useT, useLocale, type Locale } from '@/lib/i18n';

type Density = 'comfortable' | 'compact';

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [density, setDensity] = useState<Density>('comfortable');

  useEffect(() => {
    setMounted(true);
    // Read density from localStorage
    const saved = localStorage.getItem('ctx-density') as Density | null;
    if (saved === 'compact' || saved === 'comfortable') {
      setDensity(saved);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('ctx-density', density);
    // Apply density class to document
    document.documentElement.dataset.density = density;
  }, [density, mounted]);

  if (!mounted) {
    return <div className="h-48 rounded-xl bg-muted/30 animate-pulse" />;
  }

  const isDark = theme === 'dark';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.pages.settings.appearance.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t.pages.settings.appearance.languageLabel}</Label>
            <p className="text-xs text-muted-foreground">
              {t.pages.settings.appearance.languageDescription}
            </p>
          </div>
          <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t.pages.settings.appearance.darkModeLabel}</Label>
            <p className="text-xs text-muted-foreground">
              {t.pages.settings.appearance.darkModeDescription}
            </p>
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t.pages.settings.appearance.densityLabel}</Label>
            <p className="text-xs text-muted-foreground">
              {t.pages.settings.appearance.densityDescription}
            </p>
          </div>
          <Select value={density} onValueChange={(v) => setDensity(v as Density)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="comfortable">{t.pages.settings.appearance.densityComfortable}</SelectItem>
              <SelectItem value="compact">{t.pages.settings.appearance.densityCompact}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
