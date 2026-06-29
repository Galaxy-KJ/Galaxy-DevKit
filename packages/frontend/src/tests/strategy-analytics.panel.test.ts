
import { StrategyAnalyticsPanel, StrategyAnalyticsCallbacks, StrategyData, PerformanceDataPoint } from '../panels/strategy-analytics';

describe('StrategyAnalyticsPanel', () => {
  let container: HTMLElement;
  let callbacks: jest.Mocked<StrategyAnalyticsCallbacks>;

  const mockStrategy: StrategyData = {
    id: 'strat-1',
    name: 'Stablecoin Auto-Compounder',
    tvl: 1000000,
    apy: 12.5,
    compoundingFrequency: 'Daily',
    distribution: [
      { asset: 'USDC', percentage: 60 },
      { asset: 'USDT', percentage: 40 }
    ]
  };

  const mockPerformance: PerformanceDataPoint[] = [
    { timestamp: 1000, tvl: 900000, yieldRate: 10 },
    { timestamp: 2000, tvl: 950000, yieldRate: 11 },
    { timestamp: 3000, tvl: 1000000, yieldRate: 12.5 }
  ];

  beforeEach(() => {
    container = document.createElement('div');
    callbacks = {
      onFetchStrategies: jest.fn().mockResolvedValue([mockStrategy]),
      onFetchPerformance: jest.fn().mockResolvedValue(mockPerformance)
    };
  });

  it('renders loading state initially', () => {
    new StrategyAnalyticsPanel(container, callbacks);
    expect(container.innerHTML).toContain('Loading strategies...');
  });

  it('fetches strategies and displays overview', async () => {
    new StrategyAnalyticsPanel(container, callbacks);
    
    // Wait for async promises to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(callbacks.onFetchStrategies).toHaveBeenCalled();
    expect(callbacks.onFetchPerformance).toHaveBeenCalledWith('strat-1');

    expect(container.innerHTML).toContain('Yield Strategy Analytics');
    expect(container.innerHTML).toContain('Stablecoin Auto-Compounder');
    expect(container.innerHTML).toContain('$1,000,000');
    expect(container.innerHTML).toContain('12.5%');
    expect(container.innerHTML).toContain('Daily');

    // Chart
    expect(container.innerHTML).toContain('<svg');
    expect(container.innerHTML).toContain('TVL');
    expect(container.innerHTML).toContain('Yield (APY)');
    expect(container.innerHTML).toContain('APY vs Base Holding');
    expect(container.innerHTML).toContain('Base Holding');

    // Distribution
    expect(container.innerHTML).toContain('Yield Distribution');
    expect(container.innerHTML).toContain('USDC');
    expect(container.innerHTML).toContain('60%');
  });

  it('handles empty strategies', async () => {
    callbacks.onFetchStrategies.mockResolvedValue([]);
    new StrategyAnalyticsPanel(container, callbacks);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(container.innerHTML).toContain('No strategies found.');
  });

  it('handles fetch errors gracefully', async () => {
    callbacks.onFetchStrategies.mockRejectedValue(new Error('Network error'));
    new StrategyAnalyticsPanel(container, callbacks);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(container.innerHTML).toContain('Failed to load strategies.');
  });

  it('updates when a new strategy is selected', async () => {
    const strat2: StrategyData = { ...mockStrategy, id: 'strat-2', name: 'High Yield Strat', tvl: 500 };
    callbacks.onFetchStrategies.mockResolvedValue([mockStrategy, strat2]);
    new StrategyAnalyticsPanel(container, callbacks);

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const select = container.querySelector('#strategy-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    
    // Trigger change
    select.value = 'strat-2';
    select.dispatchEvent(new Event('change'));

    expect(container.innerHTML).toContain('Loading performance data...');
    
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(callbacks.onFetchPerformance).toHaveBeenCalledWith('strat-2');
    expect(container.innerHTML).toContain('APY vs Base Holding');
  });
});
