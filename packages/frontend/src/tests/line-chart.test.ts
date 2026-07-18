/**
 * @jest-environment jest-environment-jsdom
 */

import { buildLineChart, buildLineChartTable } from '../charts/line-chart';

describe('buildLineChart', () => {
  it('renders an accessible svg with one vertex per point', () => {
    const svg = buildLineChart(
      [
        { ts: 1, value: 10 },
        { ts: 2, value: 20 },
        { ts: 3, value: 15 },
      ],
      { ariaLabel: 'Portfolio value over time' }
    );

    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Portfolio value over time');
    expect(svg.getAttribute('data-empty')).toBe('false');

    const path = svg.querySelector('path[data-testid="line"]');
    expect(path).not.toBeNull();
    const commands = path!.getAttribute('d')!.match(/[ML]/g) ?? [];
    expect(commands).toHaveLength(3);
  });

  it('renders an explicit empty state when there is no data', () => {
    const svg = buildLineChart([], { ariaLabel: 'Portfolio value', emptyLabel: 'observed since first load' });

    expect(svg.getAttribute('data-empty')).toBe('true');
    expect(svg.getAttribute('aria-label')).toContain('observed since first load');
    expect(svg.querySelector('path[data-testid="line"]')).toBeNull();
    expect(svg.textContent).toContain('observed since first load');
  });

  it('handles a single point without collapsing the path', () => {
    const svg = buildLineChart([{ ts: 1, value: 5 }], { ariaLabel: 'One point' });
    const path = svg.querySelector('path[data-testid="line"]');
    expect(path).not.toBeNull();
    expect(svg.getAttribute('data-empty')).toBe('false');
  });

  it('builds a data-table alternative with a row per point', () => {
    const table = buildLineChartTable(
      [
        { ts: 1000, value: 10 },
        { ts: 2000, value: 20 },
      ],
      { valueLabel: 'Value (USD)' }
    );

    expect(table.tagName.toLowerCase()).toBe('table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table.querySelectorAll('.chart-table__value')).toHaveLength(2);
  });
});
