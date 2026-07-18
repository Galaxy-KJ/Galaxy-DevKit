/**
 * @jest-environment jest-environment-jsdom
 */

import { buildPieChart, buildPieChartTable } from '../charts/pie-chart';

describe('buildPieChart', () => {
  it('renders an accessible svg with one labelled slice per entry', () => {
    const svg = buildPieChart(
      [
        { label: 'XLM', value: 60 },
        { label: 'USDC', value: 40 },
      ],
      { ariaLabel: 'Asset allocation' }
    );

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Asset allocation');
    expect(svg.getAttribute('data-empty')).toBe('false');
    expect(svg.querySelectorAll('path[data-testid="slice"]')).toHaveLength(2);
    // Meaning is never carried by colour alone: every slice is also labelled.
    expect(svg.querySelectorAll('text[data-testid="slice-label"]')).toHaveLength(2);
  });

  it('renders a single full-circle slice when one entry dominates', () => {
    const svg = buildPieChart([{ label: 'XLM', value: 100 }], { ariaLabel: 'Allocation' });
    expect(svg.querySelectorAll('path[data-testid="slice"]')).toHaveLength(1);
    expect(svg.getAttribute('data-empty')).toBe('false');
  });

  it('renders an empty state when there is no data', () => {
    const svg = buildPieChart([], { ariaLabel: 'Allocation', emptyLabel: 'No positions yet' });
    expect(svg.getAttribute('data-empty')).toBe('true');
    expect(svg.querySelectorAll('path[data-testid="slice"]')).toHaveLength(0);
    expect(svg.textContent).toContain('No positions yet');
  });

  it('ignores non-positive slices so the geometry stays valid', () => {
    const svg = buildPieChart(
      [
        { label: 'XLM', value: 50 },
        { label: 'ZERO', value: 0 },
      ],
      { ariaLabel: 'Allocation' }
    );
    expect(svg.querySelectorAll('path[data-testid="slice"]')).toHaveLength(1);
  });

  it('builds a data-table alternative with a row per slice', () => {
    const table = buildPieChartTable([
      { label: 'XLM', value: 60 },
      { label: 'USDC', value: 40 },
    ]);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table.querySelectorAll('.chart-table__value')).toHaveLength(2);
  });
});
