/**
 * @jest-environment jest-environment-jsdom
 */

import { SecurityLimitsClient } from '../services/security-limits.client';

describe('SecurityLimitsClient', () => {
  const key = 'security-limits-test';

  let client: SecurityLimitsClient;

  beforeEach(async () => {
    client = new SecurityLimitsClient(key);
    await client.clearAll();
  });

  it('creates and lists limits for an owner', async () => {
    await client.createSecurityLimit({
      owner: 'GOWNER',
      asset: 'XLM',
      limitType: 'Daily',
      maxAmount: 100,
    });

    const limits = await client.listSecurityLimits('GOWNER');
    expect(limits).toHaveLength(1);
    expect(limits[0]?.asset).toBe('XLM');
    expect(limits[0]?.limitType).toBe('Daily');
  });

  it('enforces profile and limit checks', async () => {
    await client.createSecurityLimit({
      owner: 'GOWNER',
      asset: 'USDC',
      limitType: 'PerTransaction',
      maxAmount: 50,
    });

    await client.setRiskProfile({
      owner: 'GOWNER',
      riskLevel: 'Medium',
      maxDailyVolume: 100,
      maxSingleTransaction: 80,
      allowedAssets: ['USDC'],
      blacklistedAssets: [],
    });

    const allowed = await client.checkTransactionAllowed('GOWNER', 'USDC', 25);
    expect(allowed.allowed).toBe(true);

    const blocked = await client.checkTransactionAllowed('GOWNER', 'USDC', 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('PerTransaction');
  });

  it('records transactions and returns owner records', async () => {
    await client.createSecurityLimit({
      owner: 'GOWNER',
      asset: 'XLM',
      limitType: 'Daily',
      maxAmount: 200,
    });

    const record = await client.recordTransaction('GOWNER', 'XLM', 40);
    expect(record.transactionHash).toContain('mock-tx');

    const records = await client.getTransactionRecords('GOWNER');
    expect(records).toHaveLength(1);
    expect(records[0]?.amount).toBe(40);
  });
});
