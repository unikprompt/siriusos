'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconBrandTelegram,
  IconWorld,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useLocale, type Locale } from '@/lib/i18n';
import { getOnboardingStrings } from '@/lib/i18n/onboarding';

type WizardStep = 'language' | 'organization' | 'orchestrator' | 'review' | 'run';
const STEP_ORDER: WizardStep[] = ['language', 'organization', 'orchestrator', 'review', 'run'];

const NAME_RE = /^[a-z0-9_-]+$/;

interface ValidateResultOk { ok: true; botUsername: string; chatType: string; chatTitle?: string }
interface ValidateResultFail { ok: false; reason: string; message?: string }
type ValidateResult = ValidateResultOk | ValidateResultFail;

interface RunLog { step: string; status: 'ok' | 'fail' | 'info'; output: string }
interface RunResult { ok: boolean; reason?: string; message?: string; logs: RunLog[] }

export default function OnboardingPage() {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const t = useMemo(() => getOnboardingStrings(locale), [locale]);

  const [step, setStep] = useState<WizardStep>('language');

  // Step 2 — organization
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('');

  // Step 3 — orchestrator
  const [orchName, setOrchName] = useState('boss');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [fetchingChatId, setFetchingChatId] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);

  // Step 5 — run
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  useEffect(() => {
    try {
      setOrgTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      setOrgTimezone('UTC');
    }
  }, []);

  const stepIndex = STEP_ORDER.indexOf(step);

  function pickLanguage(next: Locale) {
    setLocale(next);
    setStep('organization');
  }

  async function fetchChatIdAuto() {
    if (!botToken.trim()) return;
    setFetchingChatId(true);
    try {
      const res = await fetch('/api/onboarding/fetch-chat-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });
      const data = await res.json();
      if (data.chatId) setChatId(String(data.chatId));
    } finally {
      setFetchingChatId(false);
    }
  }

  async function validateTelegram() {
    if (!botToken.trim() || !chatId.trim()) return;
    setValidating(true);
    setValidation(null);
    try {
      const res = await fetch('/api/onboarding/validate-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim(), chatId: chatId.trim() }),
      });
      const data = (await res.json()) as ValidateResult;
      setValidation(data);
    } catch (err) {
      setValidation({ ok: false, reason: 'network_error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setValidating(false);
    }
  }

  async function runSetup() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/onboarding/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: locale,
          orgName: orgName.trim(),
          orgDescription: orgDescription.trim() || undefined,
          orchestratorName: orchName.trim(),
          botToken: botToken.trim(),
          chatId: chatId.trim(),
        }),
      });
      const data = (await res.json()) as RunResult;
      setRunResult(data);
    } catch (err) {
      setRunResult({
        ok: false,
        reason: 'network_error',
        message: err instanceof Error ? err.message : String(err),
        logs: [],
      });
    } finally {
      setRunning(false);
    }
  }

  const orgNameInvalid = orgName.length > 0 && !NAME_RE.test(orgName);
  const orchNameInvalid = orchName.length > 0 && !NAME_RE.test(orchName);
  const canAdvanceOrg = orgName.length > 0 && !orgNameInvalid;
  const canAdvanceOrch = orchName.length > 0 && !orchNameInvalid && botToken.length > 0 && chatId.length > 0 && validation?.ok === true;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <ProgressHeader stepIndex={stepIndex} total={STEP_ORDER.length} progressLabel={t.common.progress.replace('{current}', String(stepIndex + 1)).replace('{total}', String(STEP_ORDER.length))} />

      {step === 'language' && (
        <Card>
          <CardHeader>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">{t.language.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.language.subtitle}</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => pickLanguage('en')}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 transition-colors hover:border-primary/50 hover:bg-surface-2"
            >
              <IconWorld size={28} className="text-primary" />
              <span className="text-base font-medium">English</span>
              <span className="text-xs text-muted-foreground">{t.language.pickEnglish}</span>
            </button>
            <button
              type="button"
              onClick={() => pickLanguage('es')}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 transition-colors hover:border-primary/50 hover:bg-surface-2"
            >
              <IconWorld size={28} className="text-primary" />
              <span className="text-base font-medium">Español</span>
              <span className="text-xs text-muted-foreground">{t.language.pickSpanish}</span>
            </button>
          </CardContent>
        </Card>
      )}

      {step === 'organization' && (
        <Card>
          <CardHeader>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">{t.organization.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.organization.subtitle}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgName">{t.organization.nameLabel}</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value.toLowerCase())}
                placeholder={t.organization.namePlaceholder}
                autoFocus
              />
              {orgNameInvalid && <p className="text-xs text-destructive">{t.organization.nameInvalid}</p>}
              {!orgNameInvalid && <p className="text-xs text-muted-foreground">{t.organization.nameRules}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="orgDescription">{t.organization.descriptionLabel}</Label>
              <Input
                id="orgDescription"
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                placeholder={t.organization.descriptionPlaceholder}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="orgTimezone">{t.organization.timezoneLabel}</Label>
              <Input id="orgTimezone" value={orgTimezone} onChange={(e) => setOrgTimezone(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t.organization.timezoneAuto}</p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('language')}>
                <IconArrowLeft size={14} className="mr-1" />
                {t.common.back}
              </Button>
              <Button disabled={!canAdvanceOrg} onClick={() => setStep('orchestrator')}>
                {t.common.next}
                <IconArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'orchestrator' && (
        <Card>
          <CardHeader>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">{t.orchestrator.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.orchestrator.subtitle}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="orchName">{t.orchestrator.nameLabel}</Label>
              <Input
                id="orchName"
                value={orchName}
                onChange={(e) => setOrchName(e.target.value.toLowerCase())}
                placeholder={t.orchestrator.namePlaceholder}
              />
              {orchNameInvalid && <p className="text-xs text-destructive">{t.orchestrator.nameInvalid}</p>}
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-4 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">
                <IconBrandTelegram size={14} className="inline mr-1 text-primary" />
                {t.orchestrator.introBotFather}
              </p>
              <p>{t.orchestrator.botFatherSteps}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="botToken">{t.orchestrator.tokenLabel}</Label>
              <Input
                id="botToken"
                type="password"
                value={botToken}
                onChange={(e) => { setBotToken(e.target.value); setValidation(null); }}
                placeholder={t.orchestrator.tokenPlaceholder}
              />
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              {t.orchestrator.sendMessageHint}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="chatId">{t.orchestrator.chatIdManualLabel}</Label>
                <Input
                  id="chatId"
                  value={chatId}
                  onChange={(e) => { setChatId(e.target.value); setValidation(null); }}
                  placeholder={t.orchestrator.chatIdManualPlaceholder}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={fetchChatIdAuto}
                disabled={!botToken.trim() || fetchingChatId}
              >
                {fetchingChatId ? t.orchestrator.fetching : t.orchestrator.fetchChatId}
              </Button>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="default"
                onClick={validateTelegram}
                disabled={!botToken.trim() || !chatId.trim() || validating}
              >
                {validating ? <><IconLoader2 size={14} className="mr-1 animate-spin" />{t.orchestrator.validating}</> : t.orchestrator.validate}
              </Button>
              {validation?.ok && (
                <p className="text-xs text-success">
                  <IconCheck size={14} className="inline mr-1" />
                  {t.orchestrator.validatedOk
                    .replace('{bot}', validation.botUsername)
                    .replace('{chat}', chatId)}
                </p>
              )}
              {validation && !validation.ok && (
                <p className="text-xs text-destructive">
                  <IconAlertTriangle size={14} className="inline mr-1" />
                  {validation.reason === 'bad_token' ? t.orchestrator.badToken
                    : validation.reason === 'network_error' ? t.orchestrator.networkError
                    : `${t.orchestrator.validationFailed} (${validation.reason})`}
                </p>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('organization')}>
                <IconArrowLeft size={14} className="mr-1" />
                {t.common.back}
              </Button>
              <Button disabled={!canAdvanceOrch} onClick={() => setStep('review')}>
                {t.common.next}
                <IconArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'review' && (
        <Card>
          <CardHeader>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">{t.review.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.review.subtitle}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow label={t.review.languageLabel} value={locale === 'es' ? 'Español' : 'English'} />
            <SummaryRow label={t.review.organizationLabel} value={orgName} sub={orgDescription || undefined} />
            <SummaryRow label={t.review.orchestratorLabel} value={orchName} />
            <SummaryRow
              label={t.review.telegramLabel}
              value={(validation?.ok ? validation.botUsername : '')}
              sub={t.review.telegramSummary
                .replace('{bot}', validation?.ok ? validation.botUsername : '')
                .replace('{chat}', chatId)}
            />

            <div className="flex justify-between pt-3">
              <Button variant="ghost" onClick={() => setStep('orchestrator')}>
                <IconArrowLeft size={14} className="mr-1" />
                {t.common.back}
              </Button>
              <Button onClick={() => { setStep('run'); runSetup(); }}>
                {t.review.runSetup}
                <IconArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'run' && (
        <Card>
          <CardHeader>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">{t.run.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.run.subtitle}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {running && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconLoader2 size={16} className="animate-spin text-primary" />
                {t.review.runningSetup}
              </div>
            )}

            {runResult && (
              <div className={`rounded-lg border p-4 ${runResult.ok ? 'border-success/30 bg-success/10' : 'border-destructive/30 bg-destructive/10'}`}>
                {runResult.ok ? (
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-success">
                      <IconCheck size={16} />
                      {t.run.successHeading}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.run.successDetail}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <IconAlertTriangle size={16} />
                      {t.run.failed}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {runResult.reason ? `${runResult.reason}` : ''}
                      {runResult.message ? ` · ${runResult.message}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.run.failedHint}</p>
                  </div>
                )}
              </div>
            )}

            {runResult && runResult.logs.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.run.streamingLogs}</p>
                <pre className="max-h-80 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">
                  {runResult.logs.map((entry, i) => (
                    <div key={i} className={entry.status === 'fail' ? 'text-destructive' : entry.status === 'ok' ? 'text-foreground' : 'text-muted-foreground'}>
                      <span className="font-semibold">{entry.status === 'ok' ? '▸' : entry.status === 'fail' ? '✗' : 'ℹ'} {entry.step}</span>
                      {entry.output && <div className="whitespace-pre-wrap pl-4 text-muted-foreground">{entry.output}</div>}
                    </div>
                  ))}
                </pre>
              </div>
            )}

            {runResult?.ok && (
              <div className="flex justify-end pt-2">
                <Button onClick={() => router.push('/')}>
                  {t.run.goToDashboard}
                  <IconArrowRight size={14} className="ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProgressHeader({ stepIndex, total, progressLabel }: { stepIndex: number; total: number; progressLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{progressLabel}</p>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-right">
        <p className="text-sm font-medium">{value || '—'}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
