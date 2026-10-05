jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  const Server = jest.fn().mockImplementation(() => ({
    loadAccount: async (id: string) => new actual.Account(id, '1'),
  }));
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server,
    },
  };
});

import { Asset, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { findOptimalPath } from './route-finder';
import { estimatePathPayment, executePathPayment, PathPaymentError } from './path-payment';

const HORIZON = 'https://horizon-testnet.stellar.org';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 503 ? 'Service Unavailable' : 'OK',
    json: async () => body,
  } as Response;
}

function pathBody(records: unknown[]) {
  return { _embedded: { records } };
}

describe('path payment quotes', () => {
  const issuer = Keypair.random().publicKey();
  const usdc = new Asset('USDC', issuer);
  const longAsset = new Asset('LONGASSETXXX', issuer);

  beforeEach(() => {
    jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries strict send with source_amount', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([{
      source_amount: '100',
      destination_amount: '20',
      path: [],
    }])));

    await findOptimalPath({
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '100',
      mode: 'strict-send',
      horizonUrl: HORIZON,
    });

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.pathname).toContain('/paths/strict-send');
    expect(url.searchParams.get('source_amount')).toBe('100');
    expect(url.searchParams.get('source_asset_type')).toBe('native');
    expect(url.searchParams.get('destination_assets')).toBe(`USDC:${issuer}`);
    expect(url.searchParams.has('destination_asset_type')).toBe(false);
    expect(url.searchParams.has('destination_account')).toBe(false);
    expect(url.searchParams.has('amount')).toBe(false);
  });

  it('queries strict receive with destination_amount and source_account', async () => {
    const source = Keypair.random().publicKey();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([{
      source_amount: '50',
      destination_amount: '25',
      path: [],
    }])));

    await findOptimalPath({
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '25',
      mode: 'strict-receive',
      horizonUrl: HORIZON,
      sourceAccount: source,
    });

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.pathname).toContain('/paths/strict-receive');
    expect(url.searchParams.get('destination_amount')).toBe('25');
    expect(url.searchParams.get('source_account')).toBe(source);
    expect(url.searchParams.has('source_assets')).toBe(false);
    expect(url.searchParams.has('source_asset_type')).toBe(false);
    expect(url.searchParams.get('destination_asset_type')).toBe('credit_alphanum4');
    expect(url.searchParams.has('amount')).toBe(false);
  });

  it('queries strict receive assets as source_assets when no account is given', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([{
      source_amount: '40',
      destination_amount: '25',
      path: [],
    }])));

    await findOptimalPath({
      sourceAsset: usdc,
      destinationAsset: Asset.native(),
      amount: '25',
      mode: 'strict-receive',
      horizonUrl: HORIZON,
    });

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.searchParams.get('destination_amount')).toBe('25');
    expect(url.searchParams.get('destination_asset_type')).toBe('native');
    expect(url.searchParams.get('source_assets')).toBe(`USDC:${issuer}`);
    expect(url.searchParams.has('source_asset_type')).toBe(false);
    expect(url.searchParams.has('source_account')).toBe(false);
    expect(url.searchParams.has('amount')).toBe(false);
  });

  it('sends credit_alphanum12 for a 12 character code', async () => {
    expect(longAsset.getAssetType()).toBe('credit_alphanum12');
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([{
      source_amount: '1',
      destination_amount: '1',
      path: [],
    }])));

    await findOptimalPath({
      sourceAsset: longAsset,
      destinationAsset: usdc,
      amount: '1',
      mode: 'strict-send',
      horizonUrl: HORIZON,
    });

    const url = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toContain('source_asset_type=credit_alphanum12');
  });

  it('rejects an empty book', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([])));
    await expect(findOptimalPath({
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '10',
      mode: 'strict-send',
      horizonUrl: HORIZON,
    })).rejects.toBeInstanceOf(PathPaymentError);
    await expect(findOptimalPath({
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '10',
      mode: 'strict-send',
      horizonUrl: HORIZON,
    })).rejects.toMatchObject({ code: 'NO_PATH_FOUND' });
  });

  it('rejects an http 503 as a network error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(503, {}));
    await expect(findOptimalPath({
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '10',
      mode: 'strict-send',
      horizonUrl: HORIZON,
    })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('protects a strict send quote by rounding the destination down', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([{
      source_amount: '100.0000000',
      destination_amount: '20.0000000',
      path: [],
    }])));

    const estimate = await estimatePathPayment({
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '100',
      mode: 'strict-send',
      slippageTolerance: 0.01,
      network: 'testnet',
    });

    expect(estimate.slippageAdjustedAmount).toBe('19.8000000');
  });

  it('protects a strict receive quote by rounding the source up', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([{
      source_amount: '50.0000000',
      destination_amount: '25.0000000',
      path: [],
    }])));

    const estimate = await estimatePathPayment({
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '25',
      mode: 'strict-receive',
      slippageTolerance: 0.01,
      network: 'testnet',
    });

    expect(estimate.slippageAdjustedAmount).toBe('50.5000000');
  });

  it('builds a strict send operation from the quoted minimum', async () => {
    const keypair = Keypair.random();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, pathBody([{
      source_amount: '100.0000000',
      destination_amount: '20.0000000',
      path: [],
    }])));
    const result = await executePathPayment(keypair, {
      sourceAsset: Asset.native(),
      destinationAsset: usdc,
      amount: '100',
      mode: 'strict-send',
      slippageTolerance: 0.01,
      network: 'testnet',
    });

    const tx = TransactionBuilder.fromXDR(result.signedXdr, Networks.TESTNET);
    const operation = tx.operations[0] as { type: string; destMin: string };
    expect(operation.type).toBe('pathPaymentStrictSend');
    expect(operation.destMin).toBe('19.8000000');
  });
});
