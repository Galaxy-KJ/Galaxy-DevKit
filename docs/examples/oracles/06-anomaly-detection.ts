import {
  OracleAggregator,
  CoinGeckoSource,
  CoinMarketCapSource,
  OracleValidationError,
} from '@galaxy-kj/core-oracles';

async function run() {
  const aggregator = new OracleAggregator({
    minSources: 2,
    maxDeviationPercent: 12,
    anomalyDetection: {
      stalePriceMs: 45_000,
      outlierStdDevMultiplier: 2,
      flashCrashPercent: 20,
      sourceDisagreementPercent: 10,
      enforceFlashCrashProtection: true,
      enforceSourceDisagreement: true,
    },
  });

  aggregator.addSource(new CoinGeckoSource(), 1);
  aggregator.addSource(new CoinMarketCapSource(process.env.CMC_API_KEY), 1);

  try {
    const price = await aggregator.getAggregatedPrice('XLM');
    console.log('Validated price frame:', price);
  } catch (error) {
    if (error instanceof OracleValidationError) {
      console.error('Validation failed with structured payload:', error.toJSON());
      return;
    }
    throw error;
  }
}

run().catch(console.error);
