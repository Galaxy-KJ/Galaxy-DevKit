import type {} from '../../../api/rest/src/types/express';
/** Exercise the actual REST router over a local HTTP socket. Protocol services
 * and auth/audit are mocked; this does not claim a live-chain or database test. */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GalaxyClient } from './index';
import { setupDefiRoutes } from '../../../api/rest/src/routes/defi.routes';

jest.mock('../../../api/rest/src/middleware/auth', () => ({ authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
jest.mock('../../../api/rest/src/services/audit-logger', () => ({ AuditLogger: jest.fn(() => ({ log: jest.fn().mockResolvedValue(undefined) })) }));
jest.mock('@galaxy-kj/core-defi-protocols', () => ({
  ProtocolFactory: { getInstance: () => ({ createProtocol: () => ({
    initialize: async () => {},
    getSwapQuote: async (tokenIn: unknown, tokenOut: unknown, amountIn: string) => ({ tokenIn, tokenOut, amountIn, amountOut: '2', priceImpact: '0', minimumReceived: '1.99', path: [], validUntil: new Date('2026-01-01T00:00:00Z') }),
    supply: async (_publicKey: string, privateKey: string, _asset: unknown, amount: string) => {
      if (privateKey !== '') throw new Error('REST must not sign');
      return { hash: 'unsigned-xdr-fixture', status: 'pending', ledger: 0, createdAt: new Date('2026-01-01T00:00:00Z'), metadata: { amount } };
    },
  }) }) },
  DexAggregatorService: jest.fn(() => ({ getBestQuote: async (_a: unknown, _b: unknown, amountIn: string) => ({ amountIn, totalAmountOut: '2', routes: [], totalPriceImpact: 0 }) })),
}));

describe('REST route contract over HTTP', () => {
  let server: Server;
  let client: GalaxyClient;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/defi', setupDefiRoutes());
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    client = new GalaxyClient({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

  test('actual router parses quote params and serializes dates', async () => {
    const result = await client.defi.soroswap.getQuote({ assetIn: 'XLM', assetOut: 'USD:GISSUER', amountIn: '1.0000001' });
    expect(result.tokenOut).toEqual({ code: 'USD', issuer: 'GISSUER', type: 'credit_alphanum4' });
    expect(result.amountIn).toBe('1.0000001');
    expect(result.validUntil).toBe('2026-01-01T00:00:00.000Z');
  });
  test('unsigned transaction response is not relabelled as submitted', async () => {
    const result = await client.defi.blend.supply({ asset: 'XLM', amount: '3', signerPublicKey: `G${'A'.repeat(55)}` });
    expect(result).toMatchObject({ hash: 'unsigned-xdr-fixture', status: 'pending', ledger: 0, createdAt: '2026-01-01T00:00:00.000Z' });
  });
  test('actual REST validation errors become typed SDK errors', async () => {
    await expect(client.defi.aggregator.getQuote({ assetIn: '', assetOut: '', amountIn: '' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });
});
