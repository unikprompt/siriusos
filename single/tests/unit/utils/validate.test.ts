import { describe, expect, it } from 'vitest';
import { validateAgentName } from '../../../src/utils/validate.js';

describe('validateAgentName', () => {
  it('accepts simple lowercase names', () => {
    expect(() => validateAgentName('miagente')).not.toThrow();
    expect(() => validateAgentName('mi-agente')).not.toThrow();
    expect(() => validateAgentName('agent-1')).not.toThrow();
  });

  it('accepts lowercase with underscores', () => {
    expect(() => validateAgentName('my_agent')).not.toThrow();
    expect(() => validateAgentName('mi_agente_123')).not.toThrow();
  });

  it('rejects mixed case (lowercase-only for filesystem safety)', () => {
    expect(() => validateAgentName('MiAgente')).toThrow();
    expect(() => validateAgentName('Agent')).toThrow();
  });

  it('rejects empty strings', () => {
    expect(() => validateAgentName('')).toThrow();
  });

  it('rejects path traversal attempts', () => {
    expect(() => validateAgentName('../etc/passwd')).toThrow();
    expect(() => validateAgentName('./foo')).toThrow();
    expect(() => validateAgentName('a/b')).toThrow();
  });

  it('rejects shell metacharacters', () => {
    expect(() => validateAgentName('rm -rf /')).toThrow();
    expect(() => validateAgentName('agent;ls')).toThrow();
    expect(() => validateAgentName('a$b')).toThrow();
    expect(() => validateAgentName('agent`whoami`')).toThrow();
  });
});
