export interface CustomMetricCard {
  id: string;
  name: string;
  unit: string;
  value: number | null;
  delta: number | null;
  target: number | null;
  trend: string;
  dimensions: Record<string, string | number | null>;
}
/** The host supplies its JWT in memory, matching the other API clients. */
export class CustomMetricsClient {
  constructor(private jwt?: string, private readonly baseUrl = '/api/v1/metrics') {}
  setJwt(jwt?: string): void { this.jwt = jwt; }
  async cards(): Promise<CustomMetricCard[]> {
    if (!this.jwt) throw new Error('Sign in to load custom metrics.');
    const request = async (path: string) => {
      const response = await fetch(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${this.jwt}` } });
      if (!response.ok) throw new Error('Custom metrics are unavailable.');
      return response.json();
    };
    const { definitions } = await request('/definitions');
    const cards: CustomMetricCard[] = [];
    // Sequential requests avoid a burst of up to 50 expensive evaluations.
    for (const definition of definitions.filter((item: { enabled: boolean }) => item.enabled)) {
      const value = await request(`/${encodeURIComponent(definition.id)}/value`);
      for (const group of value.groups) cards.push({ id: definition.id, name: definition.name, unit: definition.unit, ...group });
    }
    return cards;
  }
}
export function renderCustomMetricCards(host: HTMLElement, cards: CustomMetricCard[]): void {
  host.replaceChildren();
  if (cards.length === 0) { host.textContent = 'No enabled custom metrics.'; return; }
  for (const card of cards) {
    const article = document.createElement('article');
    article.className = 'analytics-kpi';
    const title = document.createElement('h4');
    title.textContent = card.name;
    const value = document.createElement('p');
    value.textContent = card.value === null ? 'Unavailable' : `${card.value.toLocaleString()} ${card.unit}`.trim();
    const detail = document.createElement('p');
    detail.textContent = `Change: ${card.delta ?? 'unavailable'}; target: ${card.target ?? 'not set'}; trend: ${card.trend}`;
    const dimensions = document.createElement('p');
    dimensions.textContent = Object.entries(card.dimensions).map(([key, item]) => `${key}: ${item ?? 'unknown'}`).join(', ');
    article.append(title, value, detail, dimensions);
    host.append(article);
  }
}
