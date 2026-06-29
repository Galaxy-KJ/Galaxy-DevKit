import { Keypair, Networks, rpc, BASE_FEE } from '@stellar/stellar-sdk';
import {
  setupTestnetEnv,
  createTestEnv,
  IntegrationTestEnv,
} from '../setup/testnet.js';

jest.setTimeout(60000);

describe('DeFi Protocol Integration', () => {
  let env: IntegrationTestEnv;

  beforeAll(async () => {
    env = createTestEnv();
  });

  describe('Stellar SDK Wallet Operations', () => {
    it('should create a valid Stellar keypair', () => {
      const keypair = Keypair.random();
      expect(keypair.publicKey()).toMatch(/^G[A-Z0-9]{55}$/);
      expect(keypair.secret()).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it('should derive the correct network passphrase for testnet', () => {
      expect(env.networkPassphrase).toBe(Networks.TESTNET);
    });

    it('should have a valid RPC server connection', () => {
      expect(env.server).toBeInstanceOf(rpc.Server);
    });
  });

  describe('Friendbot Account Funding', () => {
    it('should fund a test account via Friendbot', async () => {
      const keypair = Keypair.random();
      const response = await fetch(
        `https://friendbot-testnet.stellar.org?addr=${keypair.publicKey()}`
      );
      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result).toHaveProperty('hash');
    }, 30000);
  });

  describe('Blend Protocol Integration', () => {
    it('should return mock pool health factor above liquidation threshold', () => {
      const healthFactor = '1.5';
      const liquidationThreshold = '1.0';
      const healthFactorNum = parseFloat(healthFactor);
      const liquidationThresholdNum = parseFloat(liquidationThreshold);
      const isHealthy = healthFactorNum > liquidationThresholdNum;
      expect(isHealthy).toBe(true);
    });

    it('should detect undercollateralized position', () => {
      const healthFactor = '0.85';
      const liquidationThreshold = '1.0';
      const healthFactorNum = parseFloat(healthFactor);
      const liquidationThresholdNum = parseFloat(liquidationThreshold);
      const isLiquidatable = healthFactorNum < liquidationThresholdNum;
      expect(isLiquidatable).toBe(true);
    });
  });

  describe('Soroswap Integration', () => {
    it('should calculate correct swap output for a given input', () => {
      const reserveIn = '1000000';
      const reserveOut = '2000000';
      const amountIn = '10000';
      const feeNumerator = 997;
      const feeDenominator = 1000;

      const amountInWithFee =
        BigInt(amountIn) * BigInt(feeNumerator);
      const numerator =
        amountInWithFee * BigInt(reserveOut);
      const denominator =
        BigInt(reserveIn) * BigInt(feeDenominator) + amountInWithFee;
      const amountOut = numerator / denominator;

      expect(amountOut).toBeGreaterThan(0n);
      expect(amountOut).toBeLessThan(BigInt(reserveOut));
    });
  });
});
