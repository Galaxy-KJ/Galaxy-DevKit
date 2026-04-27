/**
 * @jest-environment jest-environment-jsdom
 */

import { BlendClient } from '../services/blend.client';

describe('BlendClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  it('loads position without auth header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ collateralValue: '120', debtValue: '60' }),
    });

    const client = new BlendClient({ baseUrl: '/api/v1/defi' });
    const result = await client.getPosition('GTEST');

    expect(result.collateralValue).toBe('120');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/defi/blend/position/GTEST',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('sends borrow payload with bearer token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ xdr: 'AAAA' }),
    });

    const client = new BlendClient({ baseUrl: '/api/v1/defi', jwt: 'token-123' });
    await client.borrow({
      signerPublicKey: 'GTEST',
      amount: '10',
      asset: { code: 'XLM', type: 'native' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer token-123' }));
    expect(init.body).toContain('"asset":"XLM"');
  });

  it('throws API error message when response is not ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'invalid input' } }),
    });

    const client = new BlendClient();

    await expect(
      client.repay({
        signerPublicKey: 'GTEST',
        amount: '1',
        asset: { code: 'XLM', type: 'native' },
      })
    ).rejects.toThrow('invalid input');
  });
});
