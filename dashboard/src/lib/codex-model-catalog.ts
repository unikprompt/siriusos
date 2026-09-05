export const CODEX_REASONING_EFFORTS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;

export type CodexReasoningEffort = typeof CODEX_REASONING_EFFORTS[number];

export interface CodexReasoningEffortOption {
  reasoningEffort: CodexReasoningEffort;
  description: string;
}

export interface CodexModelCatalogEntry {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  defaultReasoningEffort: CodexReasoningEffort;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
  upgrade: string | null;
  upgradeMessage: string | null;
  isDefault: boolean;
}

const ALL_CURRENT_EFFORTS: CodexReasoningEffortOption[] = [
  { reasoningEffort: 'low', description: 'Respuesta rápida con razonamiento ligero' },
  { reasoningEffort: 'medium', description: 'Equilibrio entre velocidad y profundidad' },
  { reasoningEffort: 'high', description: 'Mayor profundidad para problemas complejos' },
  { reasoningEffort: 'xhigh', description: 'Profundidad extra para problemas muy complejos' },
  { reasoningEffort: 'max', description: 'Razonamiento máximo para los problemas más difíciles' },
  { reasoningEffort: 'ultra', description: 'Razonamiento máximo con delegación automática' },
];

export const FALLBACK_CODEX_MODELS: CodexModelCatalogEntry[] = [
  {
    id: 'gpt-5.6-sol',
    model: 'gpt-5.6-sol',
    displayName: 'GPT-5.6-Sol',
    description: 'Modelo agentic de frontera para trabajo complejo.',
    hidden: false,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: ALL_CURRENT_EFFORTS,
    upgrade: null,
    upgradeMessage: null,
    isDefault: true,
  },
  {
    id: 'gpt-5.6-terra',
    model: 'gpt-5.6-terra',
    displayName: 'GPT-5.6-Terra',
    description: 'Modelo agentic equilibrado para trabajo cotidiano.',
    hidden: false,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: ALL_CURRENT_EFFORTS,
    upgrade: null,
    upgradeMessage: null,
    isDefault: false,
  },
  {
    id: 'gpt-5.6-luna',
    model: 'gpt-5.6-luna',
    displayName: 'GPT-5.6-Luna',
    description: 'Modelo agentic rápido y eficiente para tareas repetibles.',
    hidden: false,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: ALL_CURRENT_EFFORTS.filter(option => option.reasoningEffort !== 'ultra'),
    upgrade: null,
    upgradeMessage: null,
    isDefault: false,
  },
];

export function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === 'string' && (CODEX_REASONING_EFFORTS as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeEffortOptions(value: unknown): CodexReasoningEffortOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<CodexReasoningEffort>();
  const options: CodexReasoningEffortOption[] = [];

  for (const rawOption of value) {
    const option = asRecord(rawOption);
    const effort = option?.reasoningEffort;
    if (!isCodexReasoningEffort(effort) || seen.has(effort)) continue;
    seen.add(effort);
    options.push({
      reasoningEffort: effort,
      description: typeof option?.description === 'string' ? option.description : '',
    });
  }

  return options;
}

export function normalizeCodexModelCatalog(value: unknown): CodexModelCatalogEntry[] {
  const payload = asRecord(value);
  const data = payload?.data;
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const models: CodexModelCatalogEntry[] = [];

  for (const rawModel of data) {
    const entry = asRecord(rawModel);
    const model = typeof entry?.model === 'string'
      ? entry.model
      : typeof entry?.id === 'string'
        ? entry.id
        : '';
    if (!model || seen.has(model) || entry?.hidden === true) continue;

    const supportedReasoningEfforts = normalizeEffortOptions(entry?.supportedReasoningEfforts);
    if (supportedReasoningEfforts.length === 0) continue;

    const advertisedDefault = entry?.defaultReasoningEffort;
    const defaultReasoningEffort = isCodexReasoningEffort(advertisedDefault) &&
      supportedReasoningEfforts.some(option => option.reasoningEffort === advertisedDefault)
      ? advertisedDefault
      : supportedReasoningEfforts[0].reasoningEffort;

    const upgradeInfo = asRecord(entry?.upgradeInfo);
    seen.add(model);
    models.push({
      id: typeof entry?.id === 'string' ? entry.id : model,
      model,
      displayName: typeof entry?.displayName === 'string' ? entry.displayName : model,
      description: typeof entry?.description === 'string' ? entry.description : '',
      hidden: false,
      defaultReasoningEffort,
      supportedReasoningEfforts,
      upgrade: typeof entry?.upgrade === 'string' ? entry.upgrade : null,
      upgradeMessage: typeof upgradeInfo?.migrationMarkdown === 'string'
        ? upgradeInfo.migrationMarkdown.trim()
        : null,
      isDefault: entry?.isDefault === true,
    });
  }

  return models;
}

export function getModelEffortOptions(
  models: CodexModelCatalogEntry[],
  model: string | undefined,
): CodexReasoningEffortOption[] {
  const match = models.find(entry => entry.model === model);
  if (match) return match.supportedReasoningEfforts;

  const discovered = new Map<CodexReasoningEffort, CodexReasoningEffortOption>();
  for (const entry of models) {
    for (const option of entry.supportedReasoningEfforts) {
      if (!discovered.has(option.reasoningEffort)) discovered.set(option.reasoningEffort, option);
    }
  }
  return [...discovered.values()];
}

export function selectCompatibleEffort(
  models: CodexModelCatalogEntry[],
  model: string,
  current: CodexReasoningEffort | undefined,
): CodexReasoningEffort {
  const entry = models.find(candidate => candidate.model === model);
  if (!entry) return current || 'medium';
  if (current && entry.supportedReasoningEfforts.some(option => option.reasoningEffort === current)) {
    return current;
  }
  return entry.defaultReasoningEffort;
}
