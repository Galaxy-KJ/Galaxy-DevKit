import { AlertEmitter, AlertEvent, AlertSeverity } from '../../src/validation/alert-emitter.js';
import { PriceAnomaly, PriceAnomalyReport } from '../../src/validation/anomaly-detector.js';

describe('AlertEmitter', () => {
  let emitter: AlertEmitter;

  beforeEach(() => {
    emitter = new AlertEmitter({ logToConsole: false });
  });

  it('should emit an alert event for a single anomaly', () => {
    const anomaly: PriceAnomaly = {
      type: 'stale',
      source: 'coingecko',
      message: 'Price from coingecko is stale',
      value: 120000,
      threshold: 60000,
    };

    const event = emitter.onAnomaly('XLM', anomaly);

    expect(event.symbol).toBe('XLM');
    expect(event.anomalyType).toBe('stale');
    expect(event.severity).toBe('warning');
    expect(event.message).toContain('stale');
    expect(event.details).toBe(anomaly);
  });

  it('should classify flash crash as critical', () => {
    const anomaly: PriceAnomaly = {
      type: 'flash_crash',
      message: 'Flash crash protection triggered',
      value: 30,
      threshold: 25,
    };

    const event = emitter.onAnomaly('XLM', anomaly);
    expect(event.severity).toBe('critical');
  });

  it('should classify source_disagreement as warning', () => {
    const anomaly: PriceAnomaly = {
      type: 'source_disagreement',
      message: 'Source disagreement',
      value: 20,
      threshold: 15,
    };

    const event = emitter.onAnomaly('BTC', anomaly);
    expect(event.severity).toBe('warning');
  });

  it('should classify outlier as info', () => {
    const anomaly: PriceAnomaly = {
      type: 'outlier',
      source: 'coinmarketcap',
      message: 'Outlier detected',
      value: 50000,
      threshold: 2.0,
    };

    const event = emitter.onAnomaly('BTC', anomaly);
    expect(event.severity).toBe('info');
  });

  it('should emit events for full report', () => {
    const report: PriceAnomalyReport = {
      stale: [
        {
          type: 'stale',
          source: 'coingecko',
          message: 'stale',
          value: 120000,
          threshold: 60000,
        },
      ],
      outliers: [],
      flashCrash: {
        type: 'flash_crash',
        message: 'flash crash',
        value: 30,
        threshold: 25,
      },
      hasCriticalAnomaly: true,
    };

    const events = emitter.onReport('XLM', report);
    expect(events.length).toBe(2);
    expect(events[0].anomalyType).toBe('stale');
    expect(events[1].anomalyType).toBe('flash_crash');
  });

  it('should call registered callbacks', () => {
    const callback = jest.fn();
    emitter = new AlertEmitter({ logToConsole: false, callbacks: [callback] });

    const anomaly: PriceAnomaly = {
      type: 'stale',
      source: 'coingecko',
      message: 'stale',
      value: 120000,
      threshold: 60000,
    };

    emitter.onAnomaly('XLM', anomaly);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].symbol).toBe('XLM');
  });

  it('should maintain event history', () => {
    const anomaly: PriceAnomaly = {
      type: 'stale',
      source: 'coingecko',
      message: 'stale',
      value: 120000,
      threshold: 60000,
    };

    emitter.onAnomaly('XLM', anomaly);
    emitter.onAnomaly('BTC', anomaly);

    const history = emitter.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].symbol).toBe('XLM');
    expect(history[1].symbol).toBe('BTC');
  });

  it('should return recent history limited by count', () => {
    for (let i = 0; i < 20; i++) {
      emitter.onAnomaly(`ASSET${i}`, {
        type: 'stale',
        source: 'test',
        message: 'test',
        value: 100,
        threshold: 60,
      });
    }

    const recent = emitter.getRecentHistory(5);
    expect(recent.length).toBe(5);
    expect(recent[0].symbol).toBe('ASSET15');
  });

  it('should clear history', () => {
    emitter.onAnomaly('XLM', {
      type: 'stale',
      source: 'test',
      message: 'test',
      value: 100,
      threshold: 60,
    });

    emitter.clearHistory();
    expect(emitter.getHistory().length).toBe(0);
  });

  it('should update config', () => {
    emitter.updateConfig({ logLevel: 'critical' });
    const anomaly: PriceAnomaly = {
      type: 'outlier',
      source: 'test',
      message: 'test',
      value: 100,
      threshold: 2,
    };

    expect(() => emitter.onAnomaly('XLM', anomaly)).not.toThrow();
  });

  it('should not crash on async callback errors', () => {
    const failingCallback = jest.fn().mockRejectedValue(new Error('callback failed'));
    emitter = new AlertEmitter({
      logToConsole: false,
      callbacks: [failingCallback],
    });

    const anomaly: PriceAnomaly = {
      type: 'stale',
      source: 'test',
      message: 'test',
      value: 100,
      threshold: 60,
    };

    expect(() => emitter.onAnomaly('XLM', anomaly)).not.toThrow();
  });
});
