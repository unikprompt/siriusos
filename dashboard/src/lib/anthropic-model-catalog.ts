/**
 * Claude model IDs exposed by the dashboard.
 *
 * Claude Code does not currently expose a machine-readable model catalog like
 * Codex app-server does, so this list is intentionally centralized and tested.
 * Keep older models available for A/B comparisons and controlled rollbacks.
 */
export const ANTHROPIC_MODELS: string[] = [
  'claude-opus-5',
  'claude-opus-4-7',
  'claude-opus-4-7[1m]',
  'claude-opus-4-6',
  'claude-opus-4-6[1m]',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

// Preserve the existing behavior when switching back to Anthropic. Selecting a
// newer model remains an explicit user decision in the dashboard.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

/**
 * Reasoning-effort levels the Claude Code CLI accepts via `--effort`. Unlike
 * Codex, Claude Code exposes no machine-readable effort catalog, so this list
 * is centralized and tested. Note: `minimal` and `ultra` (Codex-only) are NOT
 * valid here. When no effort is selected, Claude Code applies its own default
 * (currently `xhigh`); the dashboard represents "no selection" as an empty
 * value rather than a member of this list.
 */
export const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type AnthropicEffort = typeof ANTHROPIC_EFFORTS[number];

export interface AnthropicEffortOption {
  effort: AnthropicEffort;
  description: string;
}

export const ANTHROPIC_EFFORT_OPTIONS: AnthropicEffortOption[] = [
  { effort: 'low', description: 'Respuesta rápida, menor costo' },
  { effort: 'medium', description: 'Equilibrio entre calidad y costo' },
  { effort: 'high', description: 'Mayor profundidad para trabajo exigente' },
  { effort: 'xhigh', description: 'Profundidad extra (default de Claude Code)' },
  { effort: 'max', description: 'Razonamiento máximo, mayor costo' },
];

export function isAnthropicEffort(value: unknown): value is AnthropicEffort {
  return typeof value === 'string' && (ANTHROPIC_EFFORTS as readonly string[]).includes(value);
}
