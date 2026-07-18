const SVG_NS = 'http://www.w3.org/2000/svg';

export interface LinePoint {
  ts: number;
  value: number;
}

export interface LineChartOptions {
  ariaLabel: string;
  emptyLabel?: string;
  width?: number;
  height?: number;
}

export interface LineTableOptions {
  valueLabel?: string;
}

function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag);
}

function baseSvg(width: number, height: number, ariaLabel: string): SVGSVGElement {
  const svg = svgEl('svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', ariaLabel);
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg;
}

export function buildLineChart(points: LinePoint[], options: LineChartOptions): SVGSVGElement {
  const width = options.width ?? 500;
  const height = options.height ?? 200;
  const empty = points.length === 0;
  const emptyLabel = options.emptyLabel ?? 'No data yet';
  const label = empty ? `${options.ariaLabel} — ${emptyLabel}` : options.ariaLabel;

  const svg = baseSvg(width, height, label);
  svg.setAttribute('data-empty', String(empty));

  if (empty) {
    const text = svgEl('text');
    text.setAttribute('x', String(width / 2));
    text.setAttribute('y', String(height / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart-empty');
    text.textContent = emptyLabel;
    svg.appendChild(text);
    return svg;
  }

  const padding = 20;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const xStep = innerWidth / (points.length - 1 || 1);

  const d = points
    .map((point, i) => {
      const x = padding + i * xStep;
      const y = padding + innerHeight - ((point.value - min) / range) * innerHeight;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const path = svgEl('path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('class', 'chart-line');
  path.setAttribute('data-testid', 'line');
  svg.appendChild(path);

  return svg;
}

function headerCell(text: string): HTMLTableCellElement {
  const th = document.createElement('th');
  th.scope = 'col';
  th.textContent = text;
  return th;
}

export function buildLineChartTable(points: LinePoint[], options: LineTableOptions = {}): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'chart-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(headerCell('Time'), headerCell(options.valueLabel ?? 'Value'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  points.forEach((point) => {
    const row = document.createElement('tr');
    const time = document.createElement('td');
    time.textContent = new Date(point.ts).toISOString();
    const value = document.createElement('td');
    value.className = 'chart-table__value';
    value.textContent = point.value.toLocaleString();
    row.append(time, value);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  return table;
}
