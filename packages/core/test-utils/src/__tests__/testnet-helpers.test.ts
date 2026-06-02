import {
  createFundedTestAccounts,
  createTestnetHelperContext,
  fundAccountWithFriendbot,
  submitAndVerifyTransaction,
} from '../testnet-helpers.js';

describe('testnet helpers', () => {
  it('funds accounts through Friendbot', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;

    await fundAccountWithFriendbot('GACCOUNT', {
      friendbotUrl: 'https://friendbot.test',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://friendbot.test?addr=GACCOUNT');
  });

  it('creates one funded account per worker', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;

    const accounts = await createFundedTestAccounts(2, { fetchImpl });

    expect(accounts).toHaveLength(2);
    expect(accounts[0].workerId).toBe(1);
    expect(accounts[1].workerId).toBe(2);
    expect(accounts[0].publicKey).toMatch(/^G/);
    expect(accounts[0].secretKey).toMatch(/^S/);
  });

  it('maps Jest worker ids to funded accounts', () => {
    const context = createTestnetHelperContext([
      {
        publicKey: 'G1',
        secretKey: 'S1',
        workerId: 1,
        fundedAt: new Date().toISOString(),
      },
      {
        publicKey: 'G2',
        secretKey: 'S2',
        workerId: 2,
        fundedAt: new Date().toISOString(),
      },
    ]);

    expect(context.getAccountForWorker(1).publicKey).toBe('G1');
    expect(context.getAccountForWorker(3).publicKey).toBe('G1');
  });

  it('submits and verifies transactions', async () => {
    const server = {
      submitTransaction: jest.fn(async () => ({ hash: 'hash-1' })),
      transactions: () => ({
        transaction: (hash: string) => ({
          call: jest.fn(async () => ({ hash, successful: true })),
        }),
      }),
    };

    const result = await submitAndVerifyTransaction(server, { tx: true }, { pollIntervalMs: 0 });

    expect(server.submitTransaction).toHaveBeenCalledWith({ tx: true });
    expect(result.submission.hash).toBe('hash-1');
    expect(result.verified).toEqual({ hash: 'hash-1', successful: true });
  });
});
