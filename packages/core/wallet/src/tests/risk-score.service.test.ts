import { RiskScoringService, WalletRiskInput } from '../risk-score.service';

describe('RiskScoringService', () => {
  let service: RiskScoringService;

  beforeEach(() => {
    service = new RiskScoringService();
  });

  describe('evaluateWalletRisk', () => {
    it('should return low risk for healthy position', () => {
      const input: WalletRiskInput = {
        healthFactor: 3.5,
        poolConcentration: 0.1,
        assetVolatility: 0.05,
        leverageRatio: 1.0,
        totalCollateralUSD: 10000,
        totalDebtUSD: 1000,
      };

      const result = service.evaluateWalletRisk(input);

      expect(result.score).toBeLessThan(25);
      expect(result.riskLevel).toBe('low');
      expect(result.factors).toHaveLength(0);
    });

    it('should return critical risk for highly leveraged position', () => {
      const input: WalletRiskInput = {
        healthFactor: 1.01,
        poolConcentration: 0.9,
        assetVolatility: 0.8,
        leverageRatio: 4.5,
        totalCollateralUSD: 5000,
        totalDebtUSD: 4500,
      };

      const result = service.evaluateWalletRisk(input);

      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.riskLevel).toBe('critical');
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should return medium risk for moderate position', () => {
      const input: WalletRiskInput = {
        healthFactor: 2.0,
        poolConcentration: 0.3,
        assetVolatility: 0.2,
        leverageRatio: 2.0,
        totalCollateralUSD: 10000,
        totalDebtUSD: 5000,
      };

      const result = service.evaluateWalletRisk(input);

      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.score).toBeLessThan(50);
      expect(result.riskLevel).toBe('medium');
    });

    it('should return high risk for imbalanced position', () => {
      const input: WalletRiskInput = {
        healthFactor: 1.2,
        poolConcentration: 0.7,
        assetVolatility: 0.6,
        leverageRatio: 3.0,
        totalCollateralUSD: 10000,
        totalDebtUSD: 8000,
      };

      const result = service.evaluateWalletRisk(input);

      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThan(75);
      expect(result.riskLevel).toBe('high');
    });

    it('should cap score at 0 for minimum risk', () => {
      const input: WalletRiskInput = {
        healthFactor: 10.0,
        poolConcentration: 0.0,
        assetVolatility: 0.0,
        leverageRatio: 1.0,
        totalCollateralUSD: 100000,
        totalDebtUSD: 0,
      };

      const result = service.evaluateWalletRisk(input);

      expect(result.score).toBe(0);
      expect(result.riskLevel).toBe('low');
    });

    it('should cap score at 100 for maximum risk', () => {
      const input: WalletRiskInput = {
        healthFactor: 1.0,
        poolConcentration: 1.0,
        assetVolatility: 1.0,
        leverageRatio: 5.0,
        totalCollateralUSD: 100,
        totalDebtUSD: 1000,
      };

      const result = service.evaluateWalletRisk(input);

      expect(result.score).toBe(100);
      expect(result.riskLevel).toBe('critical');
    });

    it('should include factor descriptions when thresholds exceeded', () => {
      const input: WalletRiskInput = {
        healthFactor: 1.1,
        poolConcentration: 0.8,
        assetVolatility: 0.6,
        leverageRatio: 4.0,
        totalCollateralUSD: 10000,
        totalDebtUSD: 9000,
      };

      const result = service.evaluateWalletRisk(input);

      expect(result.factors).toContainEqual(
        expect.stringContaining('Low health factor')
      );
      expect(result.factors).toContainEqual(
        expect.stringContaining('High pool concentration')
      );
      expect(result.factors).toContainEqual(
        expect.stringContaining('High asset volatility')
      );
      expect(result.factors).toContainEqual(
        expect.stringContaining('High leverage ratio')
      );
    });
  });
});
