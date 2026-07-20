import { HealthOrchestrator } from '../health-checker';
import { ComponentHealth, HealthChecker } from '../../../../types/monitoring-health-types';

function makeChecker(overrides: Partial<HealthChecker> & { result: ComponentHealth }): HealthChecker {
  return {
    name: overrides.name ?? overrides.result.name,
    critical: overrides.critical ?? true,
    check: async () => overrides.result,
  };
}

describe('HealthOrchestrator', () => {
  const now = new Date('2026-07-19T12:00:00Z');
  const startedAt = new Date('2026-07-19T11:59:00Z');
  const commonOpts = {
    version: '1.2.3',
    now: () => now,
    startedAt,
    timeoutMs: 50,
  };

  it('aggregates as up when all components are up', async () => {
    const orchestrator = new HealthOrchestrator(
      [
        makeChecker({ result: { name: 'a', status: 'up', latencyMs: 1 } }),
        makeChecker({ result: { name: 'b', status: 'up', latencyMs: 2 } }),
      ],
      commonOpts
    );
    const report = await orchestrator.runAll();
    expect(report.status).toBe('up');
    expect(report.version).toBe('1.2.3');
    expect(report.uptimeSeconds).toBe(60);
    expect(report.components).toHaveLength(2);
  });

  it('reports degraded when at least one component is degraded and none down', async () => {
    const orchestrator = new HealthOrchestrator(
      [
        makeChecker({ result: { name: 'a', status: 'up', latencyMs: 1 } }),
        makeChecker({ result: { name: 'b', status: 'degraded', latencyMs: 2 } }),
      ],
      commonOpts
    );
    const report = await orchestrator.runAll();
    expect(report.status).toBe('degraded');
  });

  it('reports down when any component is down', async () => {
    const orchestrator = new HealthOrchestrator(
      [
        makeChecker({ result: { name: 'a', status: 'degraded', latencyMs: 1 } }),
        makeChecker({ result: { name: 'b', status: 'down', latencyMs: 2 } }),
      ],
      commonOpts
    );
    const report = await orchestrator.runAll();
    expect(report.status).toBe('down');
  });

  it('marks a checker down when it throws and preserves the message', async () => {
    const orchestrator = new HealthOrchestrator(
      [
        {
          name: 'thrower',
          critical: true,
          check: async () => { throw new Error('kaboom'); },
        },
      ],
      commonOpts
    );
    const report = await orchestrator.runAll();
    expect(report.status).toBe('down');
    expect(report.components[0].message).toBe('kaboom');
    expect(report.components[0].details).toBeUndefined();
  });

  it('marks a checker down when it exceeds the timeout', async () => {
    const orchestrator = new HealthOrchestrator(
      [
        {
          name: 'slow',
          critical: true,
          check: () => new Promise((resolve) => setTimeout(() => resolve({
            name: 'slow', status: 'up', latencyMs: 200,
          }), 200)),
        },
      ],
      { ...commonOpts, timeoutMs: 10 }
    );
    const report = await orchestrator.runAll();
    expect(report.status).toBe('down');
    expect(report.components[0].details).toEqual(
      expect.objectContaining({ timeout: true, timeoutMs: 10 })
    );
  });

  it('runCritical only evaluates critical checkers', async () => {
    const criticalChecker = makeChecker({
      result: { name: 'critical', status: 'up', latencyMs: 1 },
      critical: true,
    });
    const nonCriticalCheck = jest.fn().mockResolvedValue({
      name: 'noncrit',
      status: 'down',
      latencyMs: 5,
    });
    const orchestrator = new HealthOrchestrator(
      [
        criticalChecker,
        { name: 'noncrit', critical: false, check: nonCriticalCheck },
      ],
      commonOpts
    );
    const report = await orchestrator.runCritical();
    expect(report.status).toBe('up');
    expect(report.components).toHaveLength(1);
    expect(nonCriticalCheck).not.toHaveBeenCalled();
  });
});
