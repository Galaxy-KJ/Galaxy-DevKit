import {
  detectStalePrices,
  detectStdDevOutliers,
  detectFlashCrash,
  detectSourceDisagreement,
  detectPriceAnomalies,
} from '../../src/validation/anomaly-detector.js';
import { PriceData } from '../../src/types/oracle-types.js';
import { DEFAULT_ANOMALY_CONFIG } from '../../src/validation/price-validator.js';

function buildPrice(
  source: string,
  price: number,
  ageMs: number = 0
): PriceData {
  return {
    symbol: 'XLM',
    source,
    price,
    timestamp: new Date(Date.now() - ageMs),
  };
}

describe('anomaly-detector', () => {
  it('detects stale samples', () => {
    const stale = detectStalePrices(
      [buildPrice('a', 100, 90_000), buildPrice('b', 101, 5_000)],
      60_000
    );
    expect(stale).toHaveLength(1);
    expect(stale[0].source).toBe('a');
  });

  it('detects >2 std-dev outliers', () => {
    const outliers = detectStdDevOutliers(
      [
        buildPrice('a', 100),
        buildPrice('b', 101),
        buildPrice('c', 99),
        buildPrice('d', 170),
      ],
      1.5
    );
    expect(outliers).toHaveLength(1);
    expect(outliers[0].source).toBe('d');
  });

  it('detects flash crash against previous aggregated price', () => {
    const anomaly = detectFlashCrash(
      [buildPrice('a', 70), buildPrice('b', 71)],
      100,
      20
    );
    expect(anomaly).toBeDefined();
    expect(anomaly?.type).toBe('flash_crash');
  });

  it('detects source disagreement spread', () => {
    const anomaly = detectSourceDisagreement(
      [buildPrice('a', 100), buildPrice('b', 140)],
      15
    );
    expect(anomaly).toBeDefined();
    expect(anomaly?.type).toBe('source_disagreement');
  });

  it('marks critical anomalies when enforcement is enabled', () => {
    const report = detectPriceAnomalies(
      [buildPrice('a', 70), buildPrice('b', 71)],
      { ...DEFAULT_ANOMALY_CONFIG, enforceFlashCrashProtection: true },
      100
    );
    expect(report.hasCriticalAnomaly).toBe(true);
    expect(report.flashCrash).toBeDefined();
  });

  it('returns no outliers when standard deviation is zero', () => {
    const outliers = detectStdDevOutliers(
      [buildPrice('a', 100), buildPrice('b', 100), buildPrice('c', 100)],
      2
    );
    expect(outliers).toHaveLength(0);
  });

  it('returns undefined flash crash when no baseline exists', () => {
    const anomaly = detectFlashCrash([buildPrice('a', 90)], null, 20);
    expect(anomaly).toBeUndefined();
  });

  it('returns undefined flash crash when baseline is invalid or drop is below threshold', () => {
    const invalidBaseline = detectFlashCrash([buildPrice('a', 90)], 0, 20);
    expect(invalidBaseline).toBeUndefined();

    const smallDrop = detectFlashCrash(
      [buildPrice('a', 95), buildPrice('b', 96)],
      100,
      10
    );
    expect(smallDrop).toBeUndefined();
  });

  it('returns undefined source disagreement when spread is within threshold', () => {
    const anomaly = detectSourceDisagreement(
      [buildPrice('a', 100), buildPrice('b', 102)],
      5
    );
    expect(anomaly).toBeUndefined();
  });

  it('returns undefined source disagreement when insufficient data or non-positive averages', () => {
    const insufficient = detectSourceDisagreement([buildPrice('a', 100)], 5);
    expect(insufficient).toBeUndefined();

    const nonPositive = detectSourceDisagreement(
      [buildPrice('a', 0), buildPrice('b', 0)],
      5
    );
    expect(nonPositive).toBeUndefined();
  });

  it('keeps frame non-critical when only advisory checks trigger', () => {
    const report = detectPriceAnomalies(
      [buildPrice('a', 70), buildPrice('b', 72)],
      {
        ...DEFAULT_ANOMALY_CONFIG,
        enforceFlashCrashProtection: false,
        enforceSourceDisagreement: false,
      },
      100
    );
    expect(report.hasCriticalAnomaly).toBe(false);
  });
});
