import { Command } from 'commander';
import { liquidityCommand } from '../../src/commands/protocol/liquidity.js';
import {
  getProtocolInstance,
  selectWallet,
  confirmTransaction,
} from '../../src/utils/protocol-registry';
import { outputError } from '../../src/utils/protocol-formatter';

jest.mock('../../src/utils/protocol-registry', () => ({
  getProtocolInstance: jest.fn(),
  selectWallet: jest.fn(),
  confirmTransaction: jest.fn(),
  validateAmount: jest.fn(),
}));

jest.mock('../../src/utils/protocol-formatter', () => ({
  outputTransactionPreview: jest.fn(),
  outputTransactionResult: jest.fn(),
  outputLiquidityPool: jest.fn(),
  outputLiquidityPoolList: jest.fn(),
  outputError: jest.fn(),
  outputCancelled: jest.fn(),
}));

const PAIR_ADDRESS = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQ7Q';
// Circle's official testnet USDC issuer (the same one the CLI resolves for
// the "USDC" code on testnet); the pair tests run on testnet, so the tokens
// the pair path resolves must carry this issuer to match the contract path.
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const XLM = { code: 'XLM', type: 'native' };
const USDC = { code: 'USDC', issuer: USDC_ISSUER, type: 'credit_alphanum4' };
const BTC = { code: 'BTC', issuer: 'CBTCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', type: 'credit_alphanum4' };
const ETH = { code: 'ETH', issuer: 'CETHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', type: 'credit_alphanum4' };

const mockGetLiquidityPool = jest.fn();
const mockGetPairTokens = jest.fn();
const mockRemoveLiquidity = jest.fn();
const mockProtocol = {
  initialize: jest.fn().mockResolvedValue(undefined),
  getLiquidityPool: mockGetLiquidityPool,
  getPairTokens: mockGetPairTokens,
  removeLiquidity: mockRemoveLiquidity,
};

function resetCommandOptions(cmd: Command): void {
  const c = cmd as unknown as {
    _optionValues: Record<string, unknown>;
    _optionValueSources: Record<string, unknown>;
    options: { attributeName(): string; defaultValue: unknown }[];
  };
  c._optionValues = {};
  c._optionValueSources = {};
  for (const option of c.options) {
    const key = option.attributeName();
    if (option.defaultValue !== undefined) {
      c._optionValues[key] = option.defaultValue;
      c._optionValueSources[key] = 'default';
    }
  }
}

function removeSubcommand(): Command {
  const sub = liquidityCommand.commands.find((c) => c.name() === 'remove');
  if (!sub) throw new Error('remove subcommand not found');
  return sub;
}

async function runRemove(pool: string, amount = '10'): Promise<void> {
  resetCommandOptions(liquidityCommand);
  resetCommandOptions(removeSubcommand());
  await liquidityCommand.parseAsync(
    ['remove', pool, amount, '--network', 'testnet', '--json', '-y'],
    { from: 'user' }
  );
}

describe('liquidity remove', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    (getProtocolInstance as jest.Mock).mockResolvedValue(mockProtocol);
    (selectWallet as jest.Mock).mockResolvedValue({
      name: 'test-wallet',
      publicKey: 'GD1234567890ABCDEF',
      secretKey: 'SD1234567890ABCDEF',
      network: 'testnet',
    });
    (confirmTransaction as jest.Mock).mockResolvedValue(true);
    mockGetLiquidityPool.mockResolvedValue({
      address: PAIR_ADDRESS,
      tokenA: XLM,
      tokenB: USDC,
      reserveA: '1000000',
      reserveB: '500000',
      totalLiquidity: '1500000',
      fee: '0.003',
    });
    mockGetPairTokens.mockResolvedValue({ token0: XLM, token1: USDC });
    mockRemoveLiquidity.mockResolvedValue({
      hash: 'txhash123',
      status: 'success',
      ledger: 12345,
      createdAt: new Date(),
      metadata: {},
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('pair input resolves the real pool address from the factory', async () => {
    await runRemove('XLM-USDC');

    // "USDC" resolves to its testnet issuer, so the factory lookup gets a
    // real Asset (the protocol rejects a bare code: "Non-native assets must
    // have an issuer").
    expect(mockGetLiquidityPool).toHaveBeenCalledWith(XLM, USDC);
    expect(mockRemoveLiquidity).toHaveBeenCalledWith(
      'GD1234567890ABCDEF',
      'SD1234567890ABCDEF',
      XLM,
      USDC,
      PAIR_ADDRESS,
      '10'
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('contract input reads the real tokens from the pair contract', async () => {
    // The pool holds BTC/ETH, not XLM/USDC: the old code would have sent
    // hardcoded XLM/USDC here, so this fails unless the tokens really come
    // from the contract.
    mockGetPairTokens.mockResolvedValue({ token0: BTC, token1: ETH });

    await runRemove(PAIR_ADDRESS);

    expect(mockGetPairTokens).toHaveBeenCalledWith(PAIR_ADDRESS);
    expect(mockGetLiquidityPool).not.toHaveBeenCalled();
    expect(mockRemoveLiquidity).toHaveBeenCalledWith(
      'GD1234567890ABCDEF',
      'SD1234567890ABCDEF',
      BTC,
      ETH,
      PAIR_ADDRESS,
      '10'
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('pair and contract inputs build the same transaction for the same pool', async () => {
    await runRemove('XLM-USDC');
    const pairCall = (mockRemoveLiquidity as jest.Mock).mock.calls[0];

    jest.clearAllMocks();
    (getProtocolInstance as jest.Mock).mockResolvedValue(mockProtocol);
    (selectWallet as jest.Mock).mockResolvedValue({
      name: 'test-wallet',
      publicKey: 'GD1234567890ABCDEF',
      secretKey: 'SD1234567890ABCDEF',
      network: 'testnet',
    });
    (confirmTransaction as jest.Mock).mockResolvedValue(true);
    mockGetPairTokens.mockResolvedValue({ token0: XLM, token1: USDC });

    await runRemove(PAIR_ADDRESS);
    const contractCall = (mockRemoveLiquidity as jest.Mock).mock.calls[0];

    // Same wallet, same tokens, same pool address, same amount.
    expect(contractCall).toEqual(pairCall);
  });

  it('an unknown token code fails with a clear error before any pool lookup', async () => {
    await runRemove('XLM-FAKE');

    expect(mockGetLiquidityPool).not.toHaveBeenCalled();
    expect(mockRemoveLiquidity).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(outputError).toHaveBeenCalledTimes(1);
    const err = (outputError as jest.Mock).mock.calls[0][0] as Error;
    expect(err.message).toContain('Unknown token "FAKE"');
    expect(err.message).toContain('testnet');
  });

  it('a known pair with no pool fails with a clear error, not an RPC failure', async () => {
    mockGetLiquidityPool.mockRejectedValue(
      new Error('Soroswap getLiquidityPool failed: simulation failed')
    );

    await runRemove('XLM-USDC');

    expect(mockGetLiquidityPool).toHaveBeenCalledTimes(1);
    expect(mockRemoveLiquidity).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(outputError).toHaveBeenCalledTimes(1);
    const err = (outputError as jest.Mock).mock.calls[0][0] as Error;
    expect(err.message).toContain('No liquidity pool exists for XLM-USDC');
    expect(err.message).toContain('testnet');
  });

  it('preserves the original error when the pool lookup fails on an RPC timeout', async () => {
    mockGetLiquidityPool.mockRejectedValue(
      new Error('Soroswap getLiquidityPool failed: request timed out after 30000ms')
    );

    await runRemove('XLM-USDC');

    expect(mockGetLiquidityPool).toHaveBeenCalledTimes(1);
    expect(mockRemoveLiquidity).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(outputError).toHaveBeenCalledTimes(1);
    const err = (outputError as jest.Mock).mock.calls[0][0] as Error;
    expect(err.message).toContain('timed out');
    expect(err.message).not.toContain('No liquidity pool exists');
  });
});
