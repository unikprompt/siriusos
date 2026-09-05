import { describe, expect, it } from 'vitest';
import {
  FALLBACK_CODEX_MODELS,
  getModelEffortOptions,
  normalizeCodexModelCatalog,
  selectCompatibleEffort,
} from '../codex-model-catalog';

describe('Codex model catalog', () => {
  it('normalizes visible models and their advertised reasoning efforts', () => {
    const models = normalizeCodexModelCatalog({
      data: [
        {
          id: 'gpt-5.6-sol',
          model: 'gpt-5.6-sol',
          displayName: 'GPT-5.6-Sol',
          description: 'Frontier model',
          hidden: false,
          defaultReasoningEffort: 'low',
          supportedReasoningEfforts: [
            { reasoningEffort: 'low', description: 'Fast' },
            { reasoningEffort: 'high', description: 'Deep' },
            { reasoningEffort: 'ultra', description: 'Delegates' },
          ],
          isDefault: true,
        },
        {
          id: 'hidden-model',
          model: 'hidden-model',
          hidden: true,
          defaultReasoningEffort: 'medium',
          supportedReasoningEfforts: [{ reasoningEffort: 'medium' }],
        },
      ],
    });

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      model: 'gpt-5.6-sol',
      defaultReasoningEffort: 'low',
      isDefault: true,
    });
    expect(models[0].supportedReasoningEfforts.map(option => option.reasoningEffort))
      .toEqual(['low', 'high', 'ultra']);
  });

  it('drops malformed and unknown effort values', () => {
    const models = normalizeCodexModelCatalog({
      data: [{
        id: 'gpt-test',
        defaultReasoningEffort: 'unknown',
        supportedReasoningEfforts: [
          { reasoningEffort: 'medium' },
          { reasoningEffort: 'medium' },
          { reasoningEffort: 'turbo' },
        ],
      }],
    });

    expect(models[0].defaultReasoningEffort).toBe('medium');
    expect(models[0].supportedReasoningEfforts).toEqual([
      { reasoningEffort: 'medium', description: '' },
    ]);
  });

  it('keeps a compatible effort and otherwise uses the model default', () => {
    expect(selectCompatibleEffort(FALLBACK_CODEX_MODELS, 'gpt-5.6-sol', 'high')).toBe('high');
    expect(selectCompatibleEffort(FALLBACK_CODEX_MODELS, 'gpt-5.6-luna', 'ultra')).toBe('medium');
  });

  it('returns the union of discovered efforts for a custom model', () => {
    const options = getModelEffortOptions(FALLBACK_CODEX_MODELS, 'custom-model');
    expect(options.map(option => option.reasoningEffort)).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max', 'ultra',
    ]);
  });
});
