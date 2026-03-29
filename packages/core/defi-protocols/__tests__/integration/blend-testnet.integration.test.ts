/**
 * @fileoverview Blend Protocol Testnet Integration Test
 * @description Real integration test against Stellar testnet
 */

import { Keypair } from '@stellar/stellar-sdk';
import { BlendProtocol } from '../../src/protocols/blend/blend-protocol.js';
import { ProtocolConfig } from '../../src/types/defi-types.js';

// Real testnet contract addresses
const BLEND_TESTNET_CONFIG: ProtocolConfig = {
  protocolId: 'blend',
  name: 'Blend Protocol Testnet',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015'
  },
  contractAddresses: {
    pool: 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',
    oracle: 'CAZOKR2Y5E2OSWSIBRVZMJ47RUTQPIGVWSAQ2UISGAVC46XKPGDG5PKI',
    backstop: 'CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA',
    emitter: 'CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6'
  },
  metadata: { environment: 'testnet' }
};

describe('Blend Protocol Testnet Integration', () => {
  let blend: BlendProtocol;
  let testWallet: Keypair;

  beforeAll(async () => {
    // Create test wallet
    testWallet = Keypair.random();

    // Fund account using Friendbot
    const friendbotUrl = `https://friendbot.stellar.org?addr=${testWallet.publicKey()}`;
    await fetch(friendbotUrl);

    // Wait for account creation
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Initialize Blend
    blend = new BlendProtocol(BLEND_TESTNET_CONFIG);
    await blend.initialize();
  }, 30000); // 30 second timeout

  it('should initialize successfully', () => {
    expect(blend).toBeDefined();
    expect(blend.isInitialized()).toBe(true);
    expect(blend.protocolId).toBe('blend');
  });

  it('should connect to testnet network', () => {
    expect(blend.config.network.network).toBe('testnet');
    expect(blend.config.network.sorobanRpcUrl).toContain('testnet');
  });

  it('should have valid contract addresses', () => {
    expect(blend.config.contractAddresses.pool).toBeDefined();
    expect(blend.config.contractAddresses.oracle).toBeDefined();
    expect(blend.config.contractAddresses.pool.length).toBe(56); // Stellar address length
  });

  it('should get protocol stats', async () => {
    const stats = await blend.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalSupply).toBeDefined();
    expect(stats.totalBorrow).toBeDefined();
    expect(stats.tvl).toBeDefined();
    expect(stats.timestamp).toBeInstanceOf(Date);
  }, 15000);

  it('should query user position', async () => {
    const position = await blend.getPosition(testWallet.publicKey());
    expect(position).toBeDefined();
    expect(position.address).toBe(testWallet.publicKey());
    expect(Array.isArray(position.supplied)).toBe(true);
    expect(Array.isArray(position.borrowed)).toBe(true);
  }, 15000);

  it('should get health factor', async () => {
    const health = await blend.getHealthFactor(testWallet.publicKey());
    expect(health).toBeDefined();
    expect(health.value).toBeDefined();
    expect(health.isHealthy).toBeDefined();
    expect(typeof health.isHealthy).toBe('boolean');
  }, 15000);
});
