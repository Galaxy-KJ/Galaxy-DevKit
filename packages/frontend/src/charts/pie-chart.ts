const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PieSlice {
  label: string;
  value: number;
}

export interface PieChartOptions {
  ariaLabel: string;
  emptyLabel?: string;
  size?: number;
}

function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag);
}

function pointOnCircle(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export function buildPieChart(slices: PieSlice[], options: PieChartOptions): SVGSVGElement {
  const size = options.size ?? 200;
  const positive = slices.filter((slice) => slice.value > 0);
  const empty = positive.length === 0;
  const emptyLabel = options.emptyLabel ?? 'No data yet';
  const label = empty ? `${options.ariaLabel} — ${emptyLabel}` : options.ariaLabel;

  const svg = svgEl('svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('data-empty', String(empty));

  if (empty) {
    const text = svgEl('text');
    text.setAttribute('x', String(size / 2));
    text.setAttribute('y', String(size / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart-empty');
    text.textContent = emptyLabel;
    svg.appendChild(text);
    return svg;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const total = positive.reduce((sum, slice) => sum + slice.value, 0);

  if (positive.length === 1) {
    appendSlice(svg, positive[0], `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`, cx, cy - r * 0.6);
    return svg;
  }

  let angle = -Math.PI / 2;
  positive.forEach((slice, index) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const [x0, y0] = pointOnCircle(cx, cy, r, angle);
    const [x1, y1] = pointOnCircle(cx, cy, r, angle + sweep);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    const [lx, ly] = pointOnCircle(cx, cy, r * 0.6, angle + sweep / 2);
    appendSlice(svg, slice, d, lx, ly, index);
    angle += sweep;
  });

  return svg;
}

function appendSlice(
  svg: SVGSVGElement,
  slice: PieSlice,
  d: string,
  labelX: number,
  labelY: number,
  index = 0
): void {
  const path = svgEl('path');
  path.setAttribute('d', d);
  path.setAttribute('class', `chart-slice chart-slice--${index % 6}`);
  path.setAttribute('data-testid', 'slice');
  svg.appendChild(path);

  const text = svgEl('text');
  text.setAttribute('x', labelX.toFixed(2));
  text.setAttribute('y', labelY.toFixed(2));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'chart-slice-label');
  text.setAttribute('data-testid', 'slice-label');
  text.textContent = slice.label;
  svg.appendChild(text);
}

export function buildPieChartTable(slices: PieSlice[]): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'chart-table';

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th scope="col">Asset</th><th scope="col">Value</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  slices.forEach((slice) => {
    const row = document.createElement('tr');
    const label = document.createElement('td');
    label.textContent = slice.label;
    const value = document.createElement('td');
    value.className = 'chart-table__value';
    value.textContent = slice.value.toLocaleString();
    row.append(label, value);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  return table;
}
