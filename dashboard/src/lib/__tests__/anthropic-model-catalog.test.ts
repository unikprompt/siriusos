import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  ANTHROPIC_EFFORTS,
  ANTHROPIC_EFFORT_OPTIONS,
  isAnthropicEffort,
} from '../anthropic-model-catalog';

describe('Anthropic model catalog', () => {
  it('offers the current Opus and Sonnet generations', () => {
    expect(ANTHROPIC_MODELS).toContain('claude-opus-5');
    expect(ANTHROPIC_MODELS).toContain('claude-sonnet-5');
  });

  it('keeps rollback models without duplicate entries', () => {
    expect(ANTHROPIC_MODELS).toContain('claude-opus-4-7');
    expect(ANTHROPIC_MODELS).toContain('claude-sonnet-4-6');
    expect(new Set(ANTHROPIC_MODELS).size).toBe(ANTHROPIC_MODELS.length);
  });

  it('keeps the default selectable', () => {
    expect(ANTHROPIC_MODELS).toContain(DEFAULT_ANTHROPIC_MODEL);
  });
});

describe('Anthropic effort catalog', () => {
  it('offers exactly the five Claude Code effort levels', () => {
    expect([...ANTHROPIC_EFFORTS]).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('excludes the Codex-only levels minimal and ultra', () => {
    expect(ANTHROPIC_EFFORTS as readonly string[]).not.toContain('minimal');
    expect(ANTHROPIC_EFFORTS as readonly string[]).not.toContain('ultra');
  });

  it('has one option per effort level, no duplicates', () => {
    const efforts = ANTHROPIC_EFFORT_OPTIONS.map(o => o.effort);
    expect(new Set(efforts).size).toBe(efforts.length);
    expect([...efforts].sort()).toEqual([...ANTHROPIC_EFFORTS].sort());
  });

  it('isAnthropicEffort accepts valid levels and rejects the rest', () => {
    expect(isAnthropicEffort('medium')).toBe(true);
    expect(isAnthropicEffort('xhigh')).toBe(true);
    expect(isAnthropicEffort('minimal')).toBe(false);
    expect(isAnthropicEffort('ultra')).toBe(false);
    expect(isAnthropicEffort('')).toBe(false);
    expect(isAnthropicEffort(undefined)).toBe(false);
  });
});
