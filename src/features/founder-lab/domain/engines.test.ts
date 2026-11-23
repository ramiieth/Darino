import { describe, expect, it } from 'vitest';
import {
  computeBusinessPlanStatus,
  computeCfo,
  computeVanWestendorp,
  generateConsumerPanel,
  getActiveVwData,
  summarizePanel
} from './engines';
import { createDemoProject } from '../infrastructure/founderLabRepo';

describe('Founder Lab analytical engines', () => {
  it('computes CFO unit economics, break-even, and 3 stress scenarios accurately', () => {
    const project = createDemoProject();
    const cfo = computeCfo(project);

    // 680,000 - (330,000 + 55,000 + 13,600 [2%] + 35,000 [offer]) = 246,400
    expect(cfo.totalVarUnit).toBe(433600);
    expect(cfo.contributionUnit).toBe(246400);
    expect(cfo.fixedMonthly).toBe(38000000);
    expect(cfo.breakEvenUnitsMonthly).toBe(155);
    expect(cfo.fitsCapacity).toBe(true);
    expect(cfo.year1OperatingProfit).toBeGreaterThan(0);
    expect(cfo.scenarios).toHaveLength(3);
    // Lower price scenario must reduce unit contribution
    expect(cfo.scenarios[0].result.contributionUnit).toBeLessThan(cfo.contributionUnit);
  });

  it('generates 100 diverse simulated personas and keeps them labeled as simulated', () => {
    const project = createDemoProject();
    const personas = generateConsumerPanel(project, 100, 4219);
    expect(personas).toHaveLength(100);
    expect(personas.every((p) => p.isSimulated === true)).toBe(true);
    const segments = new Set(personas.map((p) => p.segment));
    expect(segments.size).toBeGreaterThanOrEqual(4);
    const summary = summarizePanel(personas);
    expect(summary.buyers + summary.maybes + summary.nonBuyers).toBe(100);
  });

  it('computes valid ordered Van Westendorp PMC <= OPP/IPP <= PME', () => {
    const vw = computeVanWestendorp([
      { tooCheap: 200, cheap: 400, expensive: 700, tooExpensive: 1000 },
      { tooCheap: 250, cheap: 450, expensive: 750, tooExpensive: 1100 },
      { tooCheap: 300, cheap: 500, expensive: 800, tooExpensive: 1200 },
      { tooCheap: 350, cheap: 550, expensive: 850, tooExpensive: 1300 }
    ]);
    expect(vw.valid).toBe(true);
    expect(vw.pmc).toBeLessThanOrEqual(vw.pme);
    expect(vw.opp).toBeGreaterThanOrEqual(vw.pmc);
    expect(vw.opp).toBeLessThanOrEqual(vw.pme);
  });

  it('never marks a project as validated solely from simulated panel results', () => {
    const project = createDemoProject();
    expect(project.launch.experiment.status).toBe('not_started');
    const before = computeBusinessPlanStatus(project);
    expect(before.code).toBe('promising');

    // Only becomes validated when real market experiment succeeds
    project.launch.experiment.status = 'validated';
    project.launch.experiment.actualCount = 18;
    const after = computeBusinessPlanStatus(project);
    expect(after.code).toBe('validated');
  });

  it('separates real survey data from simulated panel and prioritizes real in auto mode when >= 3 rows', () => {
    const project = createDemoProject();
    expect(getActiveVwData(project).sourceUsed).toBe('simulated');

    project.realSurvey = [1, 2, 3].map((i) => ({
      id: `r_${i}`,
      respondent: `Real ${i}`,
      decision: 'buy',
      vw: { tooCheap: 300000, cheap: 500000, expensive: 800000, tooExpensive: 1100000 },
      note: '',
      createdAt: new Date().toISOString()
    }));
    expect(getActiveVwData(project).sourceUsed).toBe('real');
  });
});
