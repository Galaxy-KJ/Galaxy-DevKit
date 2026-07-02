/**
 * @fileoverview Risk Management and Leverage Dashboard panel
 * @description Renders wallet risk profiling, collateral leverage index, and
 *   color-coded risk alerts, derived from Blend lending positions. Reuses the
 *   same health-factor computation as the Blend panel so the two stay consistent.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-07-02
 */

import { BlendClient, type BlendPositionResponse } from '../services/blend.client';
import { calculateBlendHealth, getHealthTone, type BlendHealthMetrics } from './blend';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskDashboardClient {
  getPosition(publicKey: string): Promise<BlendPositionResponse>;
}

export type RiskTone = 'green' | 'yellow' | 'red';

export interface RiskProfile {
  /** 0-100, higher = riskier. Derived from debt/collateral leverage ratio. */
  riskScore: number;
  /** debt / collateral, 0 if no debt. */
  leverageIndex: number;
  tone: RiskTone;
  healthFactor: number;
}

export interface RiskAlert {
  tone: RiskTone;
  message: string;
}

// ─── Computation ──────────────────────────────────────────────────────────────

/**
 * Derives a 0-100 risk score and leverage index from Blend position metrics.
 * Risk score mirrors the same health-factor thresholds used by BlendPanel
 * (green > 1.5, yellow > 1.2, red <= 1.2) so the two panels never disagree.
 */
export function calculateRiskProfile(position: BlendPositionResponse): RiskProfile {
  const metrics: BlendHealthMetrics = calculateBlendHealth(position);
  const leverageIndex = metrics.collateral > 0 ? metrics.debt / metrics.collateral : 0;
  const tone = Number.isFinite(metrics.healthFactor)
    ? getHealthTone(metrics.healthFactor)
    : 'green';

  const riskScore = Number.isFinite(metrics.healthFactor)
    ? clamp(Math.round((1 / Math.max(metrics.healthFactor, 0.01)) * 60), 0, 100)
    : 0;

  return {
    riskScore,
    leverageIndex,
    tone,
    healthFactor: metrics.healthFactor,
  };
}

export function buildRiskAlerts(profile: RiskProfile): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (profile.tone === 'red') {
    alerts.push({
      tone: 'red',
      message: `Health factor ${formatHealthFactor(profile.healthFactor)} is at or below the liquidation danger threshold (1.2). Add collateral or repay debt.`,
    });
  } else if (profile.tone === 'yellow') {
    alerts.push({
      tone: 'yellow',
      message: `Health factor ${formatHealthFactor(profile.healthFactor)} is approaching risk (below 1.5). Monitor closely.`,
    });
  } else {
    alerts.push({
      tone: 'green',
      message: 'Position is within a healthy collateral range.',
    });
  }

  if (profile.leverageIndex > 0.7) {
    alerts.push({
      tone: 'yellow',
      message: `Leverage index ${(profile.leverageIndex * 100).toFixed(1)}% is high relative to collateral.`,
    });
  }

  return alerts;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatHealthFactor(hf: number): string {
  return Number.isFinite(hf) ? hf.toFixed(2) : '∞';
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export class RiskDashboardPanel {
  private readonly container: HTMLElement;
  private readonly client: RiskDashboardClient;

  constructor(container: string | HTMLElement, client: RiskDashboardClient = new BlendClient()) {
    this.container = typeof container === 'string'
      ? (document.getElementById(container) as HTMLElement)
      : container;

    if (!this.container) {
      throw new Error('RiskDashboardPanel container is required');
    }

    this.client = client;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <section class="risk-dashboard-panel" aria-label="Risk management and leverage dashboard">
        <h2>Risk Management &amp; Leverage Dashboard</h2>
        <p class="risk-dashboard-subtitle">Visual risk score, leverage index, and alerts derived from your Blend position.</p>

        <div class="form-field">
          <label for="rd-wallet">Wallet Public Key (G...)</label>
          <input id="rd-wallet" type="text" placeholder="G..." autocomplete="off" />
        </div>

        <div class="actions">
          <button id="rd-refresh" type="button">Load Risk Profile</button>
        </div>

        <div class="risk-dashboard-grid">
          <div id="rd-score-gauge" class="risk-gauge risk-gauge-green" role="img" aria-label="Risk score gauge">
            <strong>Risk Score</strong>
            <span id="rd-score-value">-</span>
            <small>0 = safest, 100 = highest risk</small>
          </div>

          <div id="rd-leverage-gauge" class="risk-gauge risk-gauge-green" role="img" aria-label="Leverage index gauge">
            <strong>Leverage Index</strong>
            <span id="rd-leverage-value">-</span>
            <small>debt / collateral</small>
          </div>

          <div class="risk-gauge risk-gauge-neutral" role="status">
            <strong>Liquidation Price</strong>
            <span id="rd-liquidation-value">N/A</span>
            <small>Requires price oracle data not yet exposed by the Blend position API</small>
          </div>
        </div>

        <ul id="rd-alerts" class="risk-alerts" aria-live="polite"></ul>

        <pre id="rd-position" class="blend-json" aria-label="Underlying position response"></pre>
        <p id="rd-status" class="status status-info" role="status" aria-live="polite">Ready.</p>
      </section>
    `;

    this.byId<HTMLButtonElement>('rd-refresh').addEventListener('click', () => {
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    const wallet = this.byId<HTMLInputElement>('rd-wallet').value.trim();

    if (!wallet) {
      this.setStatus('Wallet public key is required.', 'error');
      return;
    }

    this.setStatus('Loading risk profile...', 'info');

    try {
      const position = await this.client.getPosition(wallet);
      const profile = calculateRiskProfile(position);
      const alerts = buildRiskAlerts(profile);

      this.renderGauges(profile);
      this.renderAlerts(alerts);
      this.byId<HTMLElement>('rd-position').textContent = JSON.stringify(position, null, 2);
      this.setStatus('Risk profile refreshed.', 'success');
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private renderGauges(profile: RiskProfile): void {
    const scoreGauge = this.byId<HTMLElement>('rd-score-gauge');
    const leverageGauge = this.byId<HTMLElement>('rd-leverage-gauge');

    scoreGauge.className = `risk-gauge risk-gauge-${profile.tone}`;
    this.byId<HTMLElement>('rd-score-value').textContent = String(profile.riskScore);

    leverageGauge.className = `risk-gauge risk-gauge-${profile.tone}`;
    this.byId<HTMLElement>('rd-leverage-value').textContent = `${(profile.leverageIndex * 100).toFixed(1)}%`;
  }

  private renderAlerts(alerts: RiskAlert[]): void {
    const list = this.byId<HTMLUListElement>('rd-alerts');
    list.innerHTML = alerts
      .map((a) => `<li class="risk-alert risk-alert-${a.tone}">${escapeHtml(a.message)}</li>`)
      .join('');
  }

  private setStatus(message: string, tone: 'info' | 'success' | 'error'): void {
    const el = this.byId<HTMLElement>('rd-status');
    el.textContent = message;
    el.className = `status status-${tone}`;
  }

  private byId<T extends HTMLElement>(id: string): T {
    return this.container.querySelector(`#${id}`) as T;
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
