import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createExperiment,
  runExperiment,
  evaluateExperiment,
  listExperiments,
  gatherContext,
  manageCycle,
  classifyRiskLevel,
  setExperimentApprovalId,
  findAgedLowRiskExperiments,
  markExperimentAutoApproved,
} from '../src/bus/experiment.js';

describe('Sprint 3: Experiment Framework', () => {
  const testDir = join(tmpdir(), `cortextos-sprint3-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(join(testDir, 'experiments', 'history'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('createExperiment', () => {
    it('generates valid ID and JSON', () => {
      const id = createExperiment(testDir, 'testbot', 'engagement_rate', 'Shorter posts get more likes');
      expect(id).toMatch(/^exp_\d+_[a-z0-9]{5}$/);

      const filePath = join(testDir, 'experiments', 'history', `${id}.json`);
      expect(existsSync(filePath)).toBe(true);

      const exp = JSON.parse(readFileSync(filePath, 'utf-8').trim());
      expect(exp.id).toBe(id);
      expect(exp.agent).toBe('testbot');
      expect(exp.metric).toBe('engagement_rate');
      expect(exp.hypothesis).toBe('Shorter posts get more likes');
      expect(exp.status).toBe('proposed');
      expect(exp.baseline_value).toBe(0);
      expect(exp.result_value).toBeNull();
      expect(exp.decision).toBeNull();
      expect(exp.direction).toBe('higher');
      expect(exp.window).toBe('24h');
      expect(exp.started_at).toBeNull();
      expect(exp.completed_at).toBeNull();
      expect(exp.changes_description).toBeNull();
    });

    it('accepts optional surface, direction, window', () => {
      const id = createExperiment(testDir, 'testbot', 'bounce_rate', 'Less text = lower bounce', {
        surface: 'experiments/surfaces/bounce/current.md',
        direction: 'lower',
        window: '48h',
      });

      const filePath = join(testDir, 'experiments', 'history', `${id}.json`);
      const exp = JSON.parse(readFileSync(filePath, 'utf-8').trim());
      expect(exp.surface).toBe('experiments/surfaces/bounce/current.md');
      expect(exp.direction).toBe('lower');
      expect(exp.window).toBe('48h');
    });
  });

  describe('runExperiment', () => {
    it('transitions proposed -> running', () => {
      const id = createExperiment(testDir, 'testbot', 'ctr', 'Bold CTA improves CTR');
      const result = runExperiment(testDir, id, 'Changed button color to red');

      expect(result.status).toBe('running');
      expect(result.started_at).toBeTruthy();
      expect(result.changes_description).toBe('Changed button color to red');

      // active.json should exist
      const activePath = join(testDir, 'experiments', 'active.json');
      expect(existsSync(activePath)).toBe(true);
      const active = JSON.parse(readFileSync(activePath, 'utf-8').trim());
      expect(active.id).toBe(id);
      expect(active.status).toBe('running');
    });

    it('throws if experiment is not proposed', () => {
      const id = createExperiment(testDir, 'testbot', 'ctr', 'test');
      runExperiment(testDir, id);
      expect(() => runExperiment(testDir, id)).toThrow("expected 'proposed'");
    });
  });

  describe('evaluateExperiment', () => {
    it('keeps when higher is better and measured > baseline', () => {
      const id = createExperiment(testDir, 'testbot', 'engagement', 'More emojis', {
        direction: 'higher',
      });
      runExperiment(testDir, id);
      const result = evaluateExperiment(testDir, id, 42, { learning: 'Emojis work' });

      expect(result.status).toBe('completed');
      expect(result.decision).toBe('keep');
      expect(result.result_value).toBe(42);
      expect(result.baseline_value).toBe(42); // updated to measured
      expect(result.completed_at).toBeTruthy();
      expect(result.learning).toBe('Emojis work');

      // active.json should be removed
      const activePath = join(testDir, 'experiments', 'active.json');
      expect(existsSync(activePath)).toBe(false);

      // results.tsv should exist with data
      const tsvPath = join(testDir, 'experiments', 'results.tsv');
      expect(existsSync(tsvPath)).toBe(true);
      const tsvContent = readFileSync(tsvPath, 'utf-8');
      expect(tsvContent).toContain('experiment_id\tagent');
      expect(tsvContent).toContain(id);

      // learnings.md should exist with entry
      const learningsPath = join(testDir, 'experiments', 'learnings.md');
      expect(existsSync(learningsPath)).toBe(true);
      const learnings = readFileSync(learningsPath, 'utf-8');
      expect(learnings).toContain(id);
      expect(learnings).toContain('Emojis work');
    });

    it('discards when measured < baseline (direction=higher)', () => {
      const id = createExperiment(testDir, 'testbot', 'engagement', 'Remove images');
      // Manually set a higher baseline by creating, running, evaluating once
      // then creating a new experiment
      runExperiment(testDir, id);

      // Measured 0 vs baseline 0 should discard (not strictly greater)
      const result = evaluateExperiment(testDir, id, 0);
      expect(result.decision).toBe('discard');
      expect(result.baseline_value).toBe(0); // NOT updated
    });

    it('keeps when lower is better and measured < baseline', () => {
      const id = createExperiment(testDir, 'testbot', 'bounce_rate', 'Simplify nav', {
        direction: 'lower',
      });
      runExperiment(testDir, id);
      // baseline is 0, measured -5 is lower -> keep
      const result = evaluateExperiment(testDir, id, -5);
      expect(result.decision).toBe('keep');
    });

    it('throws if experiment is not running', () => {
      const id = createExperiment(testDir, 'testbot', 'ctr', 'test');
      expect(() => evaluateExperiment(testDir, id, 10)).toThrow("expected 'running'");
    });
  });

  describe('listExperiments', () => {
    it('returns all experiments sorted by created_at desc', () => {
      createExperiment(testDir, 'bot1', 'metric_a', 'hyp1');
      createExperiment(testDir, 'bot2', 'metric_b', 'hyp2');
      const list = listExperiments(testDir);
      expect(list).toHaveLength(2);
      // Most recent first
      expect(new Date(list[0].created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(list[1].created_at).getTime(),
      );
    });

    it('filters by status', () => {
      const id1 = createExperiment(testDir, 'bot1', 'ctr', 'h1');
      createExperiment(testDir, 'bot1', 'ctr', 'h2');
      runExperiment(testDir, id1);

      const running = listExperiments(testDir, { status: 'running' });
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe(id1);

      const proposed = listExperiments(testDir, { status: 'proposed' });
      expect(proposed).toHaveLength(1);
    });

    it('filters by metric', () => {
      createExperiment(testDir, 'bot1', 'ctr', 'h1');
      createExperiment(testDir, 'bot1', 'engagement', 'h2');

      const ctrOnly = listExperiments(testDir, { metric: 'ctr' });
      expect(ctrOnly).toHaveLength(1);
      expect(ctrOnly[0].metric).toBe('ctr');
    });

    it('filters by agent', () => {
      createExperiment(testDir, 'alpha', 'ctr', 'h1');
      createExperiment(testDir, 'beta', 'ctr', 'h2');

      const alphaOnly = listExperiments(testDir, { agent: 'alpha' });
      expect(alphaOnly).toHaveLength(1);
      expect(alphaOnly[0].agent).toBe('alpha');
    });

    it('returns empty array when no experiments exist', () => {
      const emptyDir = join(testDir, 'empty-agent');
      mkdirSync(emptyDir, { recursive: true });
      const list = listExperiments(emptyDir);
      expect(list).toEqual([]);
    });
  });

  describe('gatherContext', () => {
    it('calculates keep rate from completed experiments', () => {
      // Create 3 experiments: 2 keep, 1 discard
      const id1 = createExperiment(testDir, 'testbot', 'engagement', 'h1');
      runExperiment(testDir, id1);
      evaluateExperiment(testDir, id1, 10); // keep (10 > 0)

      const id2 = createExperiment(testDir, 'testbot', 'engagement', 'h2');
      runExperiment(testDir, id2);
      evaluateExperiment(testDir, id2, 5); // keep (5 > 0)

      const id3 = createExperiment(testDir, 'testbot', 'engagement', 'h3');
      runExperiment(testDir, id3);
      evaluateExperiment(testDir, id3, 0); // discard (0 not > 0)

      const ctx = gatherContext(testDir, 'testbot');
      expect(ctx.agent).toBe('testbot');
      expect(ctx.total_experiments).toBe(3);
      expect(ctx.keeps).toBe(2);
      expect(ctx.discards).toBe(1);
      expect(ctx.keep_rate).toBeCloseTo(2 / 3);
      expect(ctx.learnings).toContain('Experiment Learnings');
      expect(ctx.results_tsv).toContain('experiment_id');
    });

    it('reads IDENTITY.md and GOALS.md if present', () => {
      const { writeFileSync } = require('fs');
      writeFileSync(join(testDir, 'IDENTITY.md'), '# Test Agent\nI am a test agent.\n');
      writeFileSync(join(testDir, 'GOALS.md'), '# Goals\n- Be awesome\n');

      const ctx = gatherContext(testDir, 'testbot');
      expect(ctx.identity).toContain('Test Agent');
      expect(ctx.goals).toContain('Be awesome');
    });

    it('returns empty strings when no experiments exist', () => {
      const emptyDir = join(testDir, 'empty');
      mkdirSync(emptyDir, { recursive: true });
      const ctx = gatherContext(emptyDir, 'testbot');
      expect(ctx.total_experiments).toBe(0);
      expect(ctx.keeps).toBe(0);
      expect(ctx.discards).toBe(0);
      expect(ctx.keep_rate).toBe(0);
      expect(ctx.learnings).toBe('');
      expect(ctx.results_tsv).toBe('');
    });
  });

  describe('manageCycle', () => {
    it('creates a cycle', () => {
      const cycles = manageCycle(testDir, 'create', {
        name: 'daily-engagement',
        agent: 'testbot',
        metric: 'engagement_rate',
        surface: 'surfaces/engagement.md',
        direction: 'higher',
        window: '24h',
      });

      expect(cycles).toHaveLength(1);
      expect(cycles[0].name).toBe('daily-engagement');
      expect(cycles[0].metric).toBe('engagement_rate');

      // Verify config.json was written
      const configPath = join(testDir, 'experiments', 'config.json');
      expect(existsSync(configPath)).toBe(true);
    });

    it('modifies an existing cycle', () => {
      manageCycle(testDir, 'create', {
        name: 'weekly',
        agent: 'testbot',
        metric: 'ctr',
      });

      const cycles = manageCycle(testDir, 'modify', {
        name: 'weekly',
        metric: 'bounce_rate',
        direction: 'lower',
      });

      expect(cycles).toHaveLength(1);
      expect(cycles[0].metric).toBe('bounce_rate');
      expect(cycles[0].direction).toBe('lower');
    });

    it('removes a cycle', () => {
      manageCycle(testDir, 'create', {
        name: 'to-remove',
        agent: 'testbot',
        metric: 'ctr',
      });

      const cycles = manageCycle(testDir, 'remove', { name: 'to-remove' });
      expect(cycles).toHaveLength(0);
    });

    it('lists cycles', () => {
      manageCycle(testDir, 'create', { name: 'c1', agent: 'a', metric: 'm1' });
      manageCycle(testDir, 'create', { name: 'c2', agent: 'b', metric: 'm2' });

      const cycles = manageCycle(testDir, 'list', {});
      expect(cycles).toHaveLength(2);
    });

    it("list with agent filter returns only that agent's cycles", () => {
      manageCycle(testDir, 'create', { name: 'c1', agent: 'alice', metric: 'm1' });
      manageCycle(testDir, 'create', { name: 'c2', agent: 'alice', metric: 'm2' });
      manageCycle(testDir, 'create', { name: 'c3', agent: 'widgetbot', metric: 'm3' });

      const aliceCycles = manageCycle(testDir, 'list', { agent: 'alice' });
      expect(aliceCycles.map((c) => c.name).sort()).toEqual(['c1', 'c2']);

      const widgetCycles = manageCycle(testDir, 'list', { agent: 'widgetbot' });
      expect(widgetCycles.map((c) => c.name)).toEqual(['c3']);

      // No filter still returns all (back-compat)
      const all = manageCycle(testDir, 'list', {});
      expect(all).toHaveLength(3);
    });

    it('throws when modifying non-existent cycle', () => {
      expect(() => manageCycle(testDir, 'modify', { name: 'ghost' })).toThrow('not found');
    });

    it('throws when removing non-existent cycle', () => {
      expect(() => manageCycle(testDir, 'remove', { name: 'ghost' })).toThrow('not found');
    });

    it('throws when creating without required fields', () => {
      expect(() => manageCycle(testDir, 'create', { name: 'x' })).toThrow('requires');
    });
  });

  describe('risk classification', () => {
    it('classifies experiments/surfaces/* as low', () => {
      expect(classifyRiskLevel('experiments/surfaces/briefing/current.md')).toBe('low');
      expect(classifyRiskLevel('orgs/x/agents/y/experiments/surfaces/foo.md')).toBe('low');
    });

    it('classifies SOUL/GUARDRAILS/IDENTITY/publish as high', () => {
      expect(classifyRiskLevel('SOUL.md')).toBe('high');
      expect(classifyRiskLevel('agents/foo/GUARDRAILS.md')).toBe('high');
      expect(classifyRiskLevel('IDENTITY.md')).toBe('high');
      expect(classifyRiskLevel('src/cli/publish.ts')).toBe('high');
    });

    it('defaults to high for unknown surfaces and empty string', () => {
      expect(classifyRiskLevel('')).toBe('high');
      expect(classifyRiskLevel('some/random/path.md')).toBe('high');
    });

    it('high-risk surface beats experiments/surfaces/ prefix', () => {
      expect(classifyRiskLevel('experiments/surfaces/SOUL.md')).toBe('high');
    });

    it('createExperiment defaults risk_level from surface', () => {
      const lowId = createExperiment(testDir, 'bot', 'm', 'h', { surface: 'experiments/surfaces/x.md' });
      const highId = createExperiment(testDir, 'bot', 'm', 'h', { surface: 'SOUL.md' });
      const noSurfaceId = createExperiment(testDir, 'bot', 'm', 'h');
      const list = listExperiments(testDir);
      const map = new Map(list.map((e) => [e.id, e]));
      expect(map.get(lowId)!.risk_level).toBe('low');
      expect(map.get(highId)!.risk_level).toBe('high');
      expect(map.get(noSurfaceId)!.risk_level).toBe('high');
    });

    it('createExperiment honors explicit risk_level override', () => {
      const id = createExperiment(testDir, 'bot', 'm', 'h', {
        surface: 'experiments/surfaces/x.md',
        risk_level: 'high',
      });
      const exp = listExperiments(testDir).find((e) => e.id === id)!;
      expect(exp.risk_level).toBe('high');
    });

    it('createExperiment initializes approval_id null and auto_approved false', () => {
      const id = createExperiment(testDir, 'bot', 'm', 'h');
      const exp = listExperiments(testDir).find((e) => e.id === id)!;
      expect(exp.approval_id).toBeNull();
      expect(exp.auto_approved).toBe(false);
    });
  });

  describe('auto-approve aging', () => {
    let pendingDir: string;

    beforeEach(() => {
      pendingDir = join(testDir, 'approvals-pending');
      mkdirSync(pendingDir, { recursive: true });
      mkdirSync(join(testDir, 'experiments'), { recursive: true });
      writeFileSync(
        join(testDir, 'experiments', 'config.json'),
        JSON.stringify({ approval_required: true, auto_approve_low_risk_after_hours: 48 }),
      );
    });

    function seedExperiment(opts: {
      surface: string;
      ageHours: number;
      approvalPending: boolean;
      riskLevel?: 'low' | 'high';
    }): { id: string; approvalId: string } {
      const id = createExperiment(testDir, 'bot', 'metric_x', 'hyp', {
        surface: opts.surface,
        risk_level: opts.riskLevel,
      });
      const expFile = join(testDir, 'experiments', 'history', `${id}.json`);
      const exp = JSON.parse(readFileSync(expFile, 'utf-8'));
      exp.created_at = new Date(Date.now() - opts.ageHours * 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      writeFileSync(expFile, JSON.stringify(exp));

      const approvalId = `approval_${Math.floor(Date.now() / 1000)}_${id.slice(-5)}`;
      setExperimentApprovalId(testDir, id, approvalId);
      if (opts.approvalPending) {
        writeFileSync(
          join(pendingDir, `${approvalId}.json`),
          JSON.stringify({ id: approvalId, status: 'pending' }),
        );
      }
      return { id, approvalId };
    }

    it('returns aged low-risk pending experiments', () => {
      const { id, approvalId } = seedExperiment({
        surface: 'experiments/surfaces/x.md',
        ageHours: 50,
        approvalPending: true,
      });

      const aged = findAgedLowRiskExperiments(testDir, pendingDir);
      expect(aged).toHaveLength(1);
      expect(aged[0].experiment_id).toBe(id);
      expect(aged[0].approval_id).toBe(approvalId);
      expect(aged[0].age_hours).toBeGreaterThan(48);
    });

    it('skips experiments below the threshold', () => {
      seedExperiment({ surface: 'experiments/surfaces/x.md', ageHours: 10, approvalPending: true });
      expect(findAgedLowRiskExperiments(testDir, pendingDir)).toEqual([]);
    });

    it('skips high-risk experiments even when aged', () => {
      seedExperiment({
        surface: 'experiments/surfaces/x.md',
        ageHours: 100,
        approvalPending: true,
        riskLevel: 'high',
      });
      expect(findAgedLowRiskExperiments(testDir, pendingDir)).toEqual([]);
    });

    it('respects human decisions: skips when approval is no longer pending', () => {
      const { approvalId } = seedExperiment({
        surface: 'experiments/surfaces/x.md',
        ageHours: 100,
        approvalPending: true,
      });
      // Mario resolved it (file moved out of pending/)
      unlinkSync(join(pendingDir, `${approvalId}.json`));
      expect(findAgedLowRiskExperiments(testDir, pendingDir)).toEqual([]);
    });

    it('skips experiments without an approval_id', () => {
      const id = createExperiment(testDir, 'bot', 'm', 'h', { surface: 'experiments/surfaces/x.md' });
      // Force age past threshold but never call setExperimentApprovalId
      const expFile = join(testDir, 'experiments', 'history', `${id}.json`);
      const exp = JSON.parse(readFileSync(expFile, 'utf-8'));
      exp.created_at = new Date(Date.now() - 100 * 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      writeFileSync(expFile, JSON.stringify(exp));
      expect(findAgedLowRiskExperiments(testDir, pendingDir)).toEqual([]);
    });

    it('skips already auto-approved experiments (idempotent)', () => {
      const { id } = seedExperiment({
        surface: 'experiments/surfaces/x.md',
        ageHours: 100,
        approvalPending: true,
      });
      markExperimentAutoApproved(testDir, id);
      expect(findAgedLowRiskExperiments(testDir, pendingDir)).toEqual([]);
    });

    it('returns nothing when auto_approve_low_risk_after_hours is missing or zero', () => {
      writeFileSync(
        join(testDir, 'experiments', 'config.json'),
        JSON.stringify({ approval_required: true }),
      );
      seedExperiment({ surface: 'experiments/surfaces/x.md', ageHours: 100, approvalPending: true });
      expect(findAgedLowRiskExperiments(testDir, pendingDir)).toEqual([]);

      writeFileSync(
        join(testDir, 'experiments', 'config.json'),
        JSON.stringify({ auto_approve_low_risk_after_hours: 0 }),
      );
      expect(findAgedLowRiskExperiments(testDir, pendingDir)).toEqual([]);
    });

    it('threshold override beats config value', () => {
      // Config says 48h, override says 200h — 100h-old experiment should NOT match
      seedExperiment({ surface: 'experiments/surfaces/x.md', ageHours: 100, approvalPending: true });
      expect(findAgedLowRiskExperiments(testDir, pendingDir, { thresholdHoursOverride: 200 })).toEqual([]);
      expect(findAgedLowRiskExperiments(testDir, pendingDir, { thresholdHoursOverride: 1 })).toHaveLength(1);
    });

    it('markExperimentAutoApproved sets the flag', () => {
      const { id } = seedExperiment({
        surface: 'experiments/surfaces/x.md',
        ageHours: 100,
        approvalPending: true,
      });
      markExperimentAutoApproved(testDir, id);
      const exp = listExperiments(testDir).find((e) => e.id === id)!;
      expect(exp.auto_approved).toBe(true);
    });
  });
});
