import { classifyHealth, runPositionWatch } from '../../src/commands/watch/position.js';

describe('classifyHealth', () => {
  it('maps health factor bands to traffic-light statuses', () => {
    expect(classifyHealth(2)).toBe('green');
    expect(classifyHealth(1.3)).toBe('yellow');
    expect(classifyHealth(1.1)).toBe('red');
    expect(classifyHealth(Number.POSITIVE_INFINITY)).toBe('green');
  });
});

describe('runPositionWatch', () => {
  it('emits JSON ticks with health data', async () => {
    const lines: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as NodeJS.WriteStream & { write: typeof process.stdout.write }).write = (
      chunk: string | Uint8Array,
    ) => {
      lines.push(String(chunk));
      return true;
    };

    const blend = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getHealthFactor: jest.fn().mockResolvedValue({
        value: '1.8',
        liquidationThreshold: '1.1',
        isHealthy: true,
      }),
    };

    await runPositionWatch(
      'GCACHUZCY2EQIWYUJGOT4B6SWGWUGOTR22GRWP3QP5XHTQZZPIR3RPDG',
      { network: 'testnet', interval: '1', json: true },
      {
        blendFactory: () => blend as never,
        maxTicks: 1,
        sleep: async () => {},
      },
    );

    expect(blend.getHealthFactor).toHaveBeenCalled();
    expect(lines.some((line) => line.includes('"healthFactor":"1.8"'))).toBe(true);

    process.stdout.write = originalWrite;
  });
});

describe('positionWatchCommand', () => {
  it('registers expected options', async () => {
    const { positionWatchCommand } = await import('../../src/commands/watch/position.js');
    expect(positionWatchCommand.name()).toBe('position');
    expect(positionWatchCommand.description()).toContain('health');
  });
});
