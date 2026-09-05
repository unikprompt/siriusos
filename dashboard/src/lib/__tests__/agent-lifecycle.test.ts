import { describe, expect, it } from 'vitest';
import { buildLifecycleCliArgs, buildPurgeCliArgs } from '@/lib/agent-lifecycle';

describe('dashboard agent lifecycle CLI mapping', () => {
  it('routes start and stop through the canonical enable/disable commands', () => {
    expect(buildLifecycleCliArgs('start', 'piaget', 'default', 'son-de-nudos')).toEqual([
      'enable', 'piaget', '--instance', 'default', '--org', 'son-de-nudos',
    ]);
    expect(buildLifecycleCliArgs('stop', 'piaget', 'default', 'son-de-nudos')).toEqual([
      'disable', 'piaget', '--instance', 'default',
    ]);
  });

  it('keeps continue and fresh restart semantics distinct', () => {
    expect(buildLifecycleCliArgs('restart_continue', 'piaget', 'default')).toEqual([
      'restart', 'piaget', '--instance', 'default',
    ]);
    expect(buildLifecycleCliArgs('restart_fresh', 'piaget', 'default')).toEqual([
      'restart', 'piaget', '--instance', 'default', '--fresh',
    ]);
  });

  it('maps permanent deletion to the canonical purge command', () => {
    expect(buildPurgeCliArgs('piaget', 'default', 'son-de-nudos')).toEqual([
      'purge', 'agent', 'piaget', '--instance', 'default', '--org', 'son-de-nudos', '--yes',
    ]);
  });

  it('requires an organization when enabling an agent', () => {
    expect(() => buildLifecycleCliArgs('start', 'piaget', 'default')).toThrow(/Organization/);
  });
});
