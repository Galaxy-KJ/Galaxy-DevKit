export interface RiskProfile {
  score: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
}

export interface WalletRiskInput {
  healthFactor: number;
  poolConcentration: number;
  assetVolatility: number;
  leverageRatio: number;
  totalCollateralUSD: number;
  totalDebtUSD: number;
}

const WEIGHTS = {
  healthFactor: 0.35,
  poolConcentration: 0.25,
  assetVolatility: 0.25,
  leverageRatio: 0.15,
} as const;

export class RiskScoringService {
  evaluateWalletRisk(input: WalletRiskInput): RiskProfile {
    const normalizedHealth = this.normalizeHealthFactor(input.healthFactor);
    const normalizedConcentration = Math.round(input.poolConcentration * 100);
    const normalizedVolatility = Math.round(input.assetVolatility * 100);
    const normalizedLeverage = this.normalizeLeverageRatio(input.leverageRatio);

    const score = Math.round(
      normalizedHealth * WEIGHTS.healthFactor +
        normalizedConcentration * WEIGHTS.poolConcentration +
        normalizedVolatility * WEIGHTS.assetVolatility +
        normalizedLeverage * WEIGHTS.leverageRatio
    );

    const cappedScore = Math.min(100, Math.max(0, score));

    return {
      score: cappedScore,
      riskLevel: this.classifyRiskLevel(cappedScore),
      factors: this.collectContributingFactors(
        input,
        normalizedHealth,
        normalizedConcentration,
        normalizedVolatility,
        normalizedLeverage
      ),
    };
  }

  private normalizeHealthFactor(healthFactor: number): number {
    if (healthFactor <= 1.0) return 100;
    if (healthFactor >= 3.0) return 0;
    return Math.round(((3.0 - healthFactor) / 2.0) * 100);
  }

  private normalizeLeverageRatio(leverageRatio: number): number {
    if (leverageRatio <= 1.0) return 0;
    if (leverageRatio >= 5.0) return 100;
    return Math.round(((leverageRatio - 1.0) / 4.0) * 100);
  }

  private classifyRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score < 25) return 'low';
    if (score < 50) return 'medium';
    if (score < 75) return 'high';
    return 'critical';
  }

  private collectContributingFactors(
    input: WalletRiskInput,
    normalizedHealth: number,
    normalizedConcentration: number,
    normalizedVolatility: number,
    normalizedLeverage: number
  ): string[] {
    const factors: string[] = [];

    if (normalizedHealth > 50) {
      factors.push(`Low health factor: ${input.healthFactor.toFixed(2)}`);
    }
    if (normalizedConcentration > 50) {
      factors.push(
        `High pool concentration: ${(input.poolConcentration * 100).toFixed(0)}%`
      );
    }
    if (normalizedVolatility > 50) {
      factors.push(
        `High asset volatility: ${(input.assetVolatility * 100).toFixed(0)}%`
      );
    }
    if (normalizedLeverage > 50) {
      factors.push(
        `High leverage ratio: ${input.leverageRatio.toFixed(2)}x`
      );
    }

    return factors;
  }
}
