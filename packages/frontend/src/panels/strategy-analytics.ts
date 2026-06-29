/**
 * Yield Strategy Analytics Dashboard
 * 
 * Renders real-time and historical performance of yield vault strategies,
 * compounding frequency metrics, TVL, and yield distribution details using native SVG.
 */

export interface StrategyData {
  id: string;
  name: string;
  tvl: number;
  apy: number;
  compoundingFrequency: string; // e.g., 'Daily', 'Weekly'
  distribution: { asset: string; percentage: number }[];
}

export interface PerformanceDataPoint {
  timestamp: number;
  tvl: number;
  yieldRate: number;
}

export interface StrategyAnalyticsCallbacks {
  onFetchStrategies: () => Promise<StrategyData[]>;
  onFetchPerformance: (strategyId: string) => Promise<PerformanceDataPoint[]>;
}

export class StrategyAnalyticsPanel {
  private container: HTMLElement;
  private callbacks: StrategyAnalyticsCallbacks;
  
  private strategies: StrategyData[] = [];
  private selectedStrategy: StrategyData | null = null;
  private performanceData: PerformanceDataPoint[] = [];

  constructor(container: HTMLElement, callbacks: StrategyAnalyticsCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.init();
  }

  private async init() {
    this.renderLoading();
    try {
      this.strategies = await this.callbacks.onFetchStrategies();
      if (this.strategies.length > 0) {
        await this.selectStrategy(this.strategies[0]);
      } else {
        this.renderEmpty();
      }
    } catch (err) {
      this.renderError('Failed to load strategies.');
    }
  }

  private async selectStrategy(strategy: StrategyData) {
    this.selectedStrategy = strategy;
    this.renderLoadingData();
    try {
      this.performanceData = await this.callbacks.onFetchPerformance(strategy.id);
      this.render();
    } catch (err) {
      this.renderError('Failed to load performance data.');
    }
  }

  private renderLoading() {
    this.container.innerHTML = '<div aria-live="polite" class="loading-state">Loading strategies...</div>';
  }

  private renderLoadingData() {
    this.container.innerHTML = '<div aria-live="polite" class="loading-state">Loading performance data...</div>';
  }

  private renderEmpty() {
    this.container.innerHTML = '<div>No strategies found.</div>';
  }

  private renderError(msg: string) {
    this.container.innerHTML = `<div class="error-state" role="alert">${msg}</div>`;
  }

  private render() {
    if (!this.selectedStrategy) return;

    this.container.innerHTML = '';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Strategy Analytics Panel');

    const header = document.createElement('h2');
    header.textContent = 'Yield Strategy Analytics';
    this.container.appendChild(header);

    // Selector
    const selectorSection = this.buildSelectorSection();
    this.container.appendChild(selectorSection);

    // Overview Stats
    const overviewSection = this.buildOverviewSection();
    this.container.appendChild(overviewSection);

    // SVG Chart
    if (this.performanceData.length > 0) {
      const chartSection = this.buildChartSection();
      this.container.appendChild(chartSection);

      const comparisonSection = this.buildComparisonSection();
      this.container.appendChild(comparisonSection);
    } else {
      const emptyChart = document.createElement('p');
      emptyChart.textContent = 'No historical data available for chart.';
      this.container.appendChild(emptyChart);
    }

    // Distribution Bars
    if (this.selectedStrategy.distribution.length > 0) {
      const distSection = this.buildDistributionSection();
      this.container.appendChild(distSection);
    }
  }

  private buildSelectorSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'strategy-selector';

    const label = document.createElement('label');
    label.htmlFor = 'strategy-select';
    label.textContent = 'Select Strategy: ';
    
    const select = document.createElement('select');
    select.id = 'strategy-select';

    this.strategies.forEach(strat => {
      const option = document.createElement('option');
      option.value = strat.id;
      option.textContent = strat.name;
      if (this.selectedStrategy?.id === strat.id) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      const strat = this.strategies.find(s => s.id === val);
      if (strat) {
        this.selectStrategy(strat);
      }
    });

    section.appendChild(label);
    section.appendChild(select);
    return section;
  }

  private buildOverviewSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'strategy-overview';
    section.style.display = 'flex';
    section.style.gap = '20px';
    section.style.marginTop = '20px';

    const statBoxes = [
      { label: 'TVL', value: `$${this.selectedStrategy!.tvl.toLocaleString()}` },
      { label: 'Current APY', value: `${this.selectedStrategy!.apy}%` },
      { label: 'Compounding', value: this.selectedStrategy!.compoundingFrequency }
    ];

    statBoxes.forEach(stat => {
      const box = document.createElement('div');
      box.className = 'stat-box';
      const title = document.createElement('strong');
      title.textContent = stat.label + ': ';
      const val = document.createElement('span');
      val.textContent = stat.value;
      box.appendChild(title);
      box.appendChild(val);
      section.appendChild(box);
    });

    return section;
  }

  private buildChartSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'strategy-chart';
    section.style.marginTop = '20px';

    const title = document.createElement('h3');
    title.textContent = 'TVL & Yield Performance';
    section.appendChild(title);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('viewBox', '0 0 500 200');
    svg.style.width = '100%';
    svg.style.maxWidth = '600px';
    svg.style.height = 'auto';
    svg.style.border = '1px solid #ccc';
    svg.style.backgroundColor = '#f9f9f9';

    // Basic mapping logic
    const padding = 20;
    const width = 500;
    const height = 200;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;

    const maxTvl = Math.max(...this.performanceData.map(d => d.tvl)) || 1;
    const maxApy = Math.max(...this.performanceData.map(d => d.yieldRate)) || 1;

    let tvlPathD = '';
    let apyPathD = '';

    const xStep = innerWidth / (this.performanceData.length - 1 || 1);

    this.performanceData.forEach((point, i) => {
      const x = padding + i * xStep;
      
      const yTvl = padding + innerHeight - (point.tvl / maxTvl) * innerHeight;
      const yApy = padding + innerHeight - (point.yieldRate / maxApy) * innerHeight;

      if (i === 0) {
        tvlPathD += `M ${x} ${yTvl}`;
        apyPathD += `M ${x} ${yApy}`;
      } else {
        tvlPathD += ` L ${x} ${yTvl}`;
        apyPathD += ` L ${x} ${yApy}`;
      }
    });

    // TVL Curve
    const tvlPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tvlPath.setAttribute('d', tvlPathD);
    tvlPath.setAttribute('fill', 'none');
    tvlPath.setAttribute('stroke', '#007BFF');
    tvlPath.setAttribute('stroke-width', '2');
    tvlPath.setAttribute('data-testid', 'tvl-curve');
    svg.appendChild(tvlPath);

    // APY Curve
    const apyPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    apyPath.setAttribute('d', apyPathD);
    apyPath.setAttribute('fill', 'none');
    apyPath.setAttribute('stroke', '#28A745');
    apyPath.setAttribute('stroke-width', '2');
    apyPath.setAttribute('data-testid', 'apy-curve');
    svg.appendChild(apyPath);

    // Legend
    const legendText1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    legendText1.setAttribute('x', '20');
    legendText1.setAttribute('y', '15');
    legendText1.setAttribute('fill', '#007BFF');
    legendText1.setAttribute('font-size', '12');
    legendText1.textContent = 'TVL';
    svg.appendChild(legendText1);

    const legendText2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    legendText2.setAttribute('x', '60');
    legendText2.setAttribute('y', '15');
    legendText2.setAttribute('fill', '#28A745');
    legendText2.setAttribute('font-size', '12');
    legendText2.textContent = 'Yield (APY)';
    svg.appendChild(legendText2);

    section.appendChild(svg);
    return section;
  }

  private buildComparisonSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'strategy-comparison';
    section.style.marginTop = '20px';

    const title = document.createElement('h3');
    title.textContent = 'APY vs Base Holding';
    section.appendChild(title);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('viewBox', '0 0 500 200');
    svg.style.width = '100%';
    svg.style.maxWidth = '600px';
    svg.style.height = 'auto';
    svg.style.border = '1px solid #ccc';
    svg.style.backgroundColor = '#f9f9f9';

    const padding = 20;
    const width = 500;
    const height = 200;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const xStep = innerWidth / (this.performanceData.length - 1 || 1);

    const apyValues = this.performanceData.map(point => point.yieldRate);
    const baseHoldingValue = apyValues.length > 0 ? apyValues[0] : 0;
    const maxValue = Math.max(...apyValues, baseHoldingValue, 1);

    let apyPathD = '';
    let basePathD = '';

    this.performanceData.forEach((point, i) => {
      const x = padding + i * xStep;
      const yApy = padding + innerHeight - (point.yieldRate / maxValue) * innerHeight;
      const yBase = padding + innerHeight - (baseHoldingValue / maxValue) * innerHeight;

      if (i === 0) {
        apyPathD += `M ${x} ${yApy}`;
        basePathD += `M ${x} ${yBase}`;
      } else {
        apyPathD += ` L ${x} ${yApy}`;
        basePathD += ` L ${x} ${yBase}`;
      }
    });

    const apyPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    apyPath.setAttribute('d', apyPathD);
    apyPath.setAttribute('fill', 'none');
    apyPath.setAttribute('stroke', '#6f42c1');
    apyPath.setAttribute('stroke-width', '2');
    apyPath.setAttribute('data-testid', 'apy-comparison-curve');
    svg.appendChild(apyPath);

    const basePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    basePath.setAttribute('d', basePathD);
    basePath.setAttribute('fill', 'none');
    basePath.setAttribute('stroke', '#6c757d');
    basePath.setAttribute('stroke-width', '2');
    basePath.setAttribute('stroke-dasharray', '6 4');
    basePath.setAttribute('data-testid', 'base-holding-curve');
    svg.appendChild(basePath);

    const legendApy = document.createElementNS("http://www.w3.org/2000/svg", "text");
    legendApy.setAttribute('x', '20');
    legendApy.setAttribute('y', '15');
    legendApy.setAttribute('fill', '#6f42c1');
    legendApy.setAttribute('font-size', '12');
    legendApy.textContent = 'Strategy APY';
    svg.appendChild(legendApy);

    const legendBase = document.createElementNS("http://www.w3.org/2000/svg", "text");
    legendBase.setAttribute('x', '110');
    legendBase.setAttribute('y', '15');
    legendBase.setAttribute('fill', '#6c757d');
    legendBase.setAttribute('font-size', '12');
    legendBase.textContent = 'Base Holding';
    svg.appendChild(legendBase);

    section.appendChild(svg);
    return section;
  }

  private buildDistributionSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'strategy-distribution';
    section.style.marginTop = '20px';

    const title = document.createElement('h3');
    title.textContent = 'Yield Distribution';
    section.appendChild(title);

    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.maxWidth = '600px';

    this.selectedStrategy!.distribution.forEach(dist => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.marginBottom = '8px';

      const label = document.createElement('div');
      label.textContent = dist.asset;
      label.style.width = '80px';
      
      const barContainer = document.createElement('div');
      barContainer.style.flex = '1';
      barContainer.style.backgroundColor = '#eee';
      barContainer.style.height = '12px';
      barContainer.style.borderRadius = '6px';
      barContainer.style.marginRight = '10px';
      barContainer.style.overflow = 'hidden';

      const barFill = document.createElement('div');
      barFill.style.width = `${dist.percentage}%`;
      barFill.style.backgroundColor = '#17a2b8';
      barFill.style.height = '100%';

      barContainer.appendChild(barFill);

      const perc = document.createElement('div');
      perc.textContent = `${dist.percentage}%`;
      perc.style.width = '40px';
      perc.style.textAlign = 'right';

      row.appendChild(label);
      row.appendChild(barContainer);
      row.appendChild(perc);
      
      container.appendChild(row);
    });

    section.appendChild(container);
    return section;
  }
}
