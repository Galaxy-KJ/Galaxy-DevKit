import { jest } from '@jest/globals';
import { SoroswapPanel } from '../panels/soroswap.js';
import { deriveAssetContractId } from '../config/soroswap-tokens.js';
import blessed from 'blessed';
import { StrKey } from '@stellar/stellar-sdk';

// Mock blessed and soroswapService. Each factory returns a FRESH object per
// call (not a single shared instance) so individual widgets — e.g. the
// wallet address textbox vs. the token textboxes — can be asserted on
// independently via blessed.<fn>.mock.results[<creation index>].value.
jest.mock('blessed', () => ({
  box: jest.fn(() => ({ on: jest.fn(), key: jest.fn() })),
  text: jest.fn(() => ({ setContent: jest.fn() })),
  textbox: jest.fn(() => ({ on: jest.fn(), key: jest.fn() })),
  button: jest.fn(() => ({ on: jest.fn(), key: jest.fn(), setContent: jest.fn(), style: { bg: 'green' } })),
  screen: jest.fn(() => ({ render: jest.fn() })),
}));

jest.mock('../services/soroswap.client.js', () => ({
  soroswapService: {
    getQuote: jest.fn(),
    executeSwap: jest.fn(),
  },
}));

const { soroswapService } = require('../services/soroswap.client.js');

/** A syntactically valid Soroban contract strkey, for use as a wallet address. */
const VALID_WALLET_ADDRESS = StrKey.encodeContract(Buffer.alloc(32, 7));

describe('SoroswapPanel', () => {
  let mockScreen: any;
  let mockGrid: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockScreen = { render: jest.fn() };
    mockGrid = { set: jest.fn().mockReturnValue({ on: jest.fn(), key: jest.fn() }) };
  });

  function createPanel(network: 'testnet' | 'mainnet' = 'testnet'): SoroswapPanel {
    return new SoroswapPanel({
      screen: mockScreen,
      grid: mockGrid,
      row: 0,
      col: 0,
      rowSpan: 12,
      colSpan: 12,
      network,
    });
  }

  /** Grab the Nth textbox created (creation order matches setupUI()). */
  function textboxAt(index: number): any {
    return (blessed.textbox as jest.Mock).mock.results[index].value;
  }

  /** Grab the Nth text element created (creation order matches setupUI()). */
  function textAt(index: number): any {
    return (blessed.text as jest.Mock).mock.results[index].value;
  }

  function button(): any {
    return (blessed.button as jest.Mock).mock.results[0].value;
  }

  function submitHandler(widget: any, event = 'submit'): (value: string) => void {
    const call = widget.on.mock.calls.find((c: any[]) => c[0] === event);
    if (!call) throw new Error(`No "${event}" handler registered on this widget`);
    return call[1];
  }

  /**
   * The swap button's 'press' handler fires `handleSwap()` without awaiting
   * or returning it, so calling the handler doesn't hand back a promise
   * tied to the swap finishing. Flush the microtask queue a few times so
   * every `await` inside `handleSwap()` (getQuote, then executeSwap) has a
   * chance to settle before assertions run.
   */
  async function flushAsync(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }

  it('should initialize correctly', () => {
    const panel = createPanel();

    expect(panel).toBeDefined();
    expect(mockGrid.set).toHaveBeenCalled();
  });

  describe('Wallet connection and swap gating (#495)', () => {
    it('shows a disconnected message and refuses to swap when no wallet address has been entered', async () => {
      createPanel();
      const statusDisplay = textAt(6); // 7th text(): wallet,tokenIn,tokenOut,amount,slippage labels + quote + status
      const swapPress = submitHandler(button(), 'press');

      await swapPress('');
      await flushAsync();

      expect(soroswapService.executeSwap).not.toHaveBeenCalled();
      expect(statusDisplay.setContent).toHaveBeenCalledWith(
        expect.stringContaining('Connect a wallet')
      );
    });

    it('rejects a wallet address that is not a valid contract address', () => {
      createPanel();
      const walletInput = textboxAt(0);
      const statusDisplay = textAt(6);

      submitHandler(walletInput)('not-a-real-address');

      expect(statusDisplay.setContent).toHaveBeenCalledWith(
        expect.stringContaining('Error')
      );
    });

    it('accepts a valid wallet address and uses it (not a hard-coded one) when swapping', async () => {
      (soroswapService.getQuote as jest.MockedFunction<(...args: any[]) => Promise<any>>).mockResolvedValue({
        amountOut: '99',
        minimumReceived: '98',
      });
      (soroswapService.executeSwap as jest.MockedFunction<(...args: any[]) => Promise<any>>).mockResolvedValue({
        hash: 'abcdef1234567890',
      });

      createPanel();
      const walletInput = textboxAt(0);
      const amountInput = textboxAt(3);
      const statusDisplay = textAt(6);

      submitHandler(walletInput)(VALID_WALLET_ADDRESS);
      submitHandler(amountInput)('100');

      const swapPress = submitHandler(button(), 'press');
      await swapPress('');
      await flushAsync();

      expect(soroswapService.executeSwap).toHaveBeenCalledWith(
        VALID_WALLET_ADDRESS,
        expect.objectContaining({ code: 'XLM', type: 'native' }),
        expect.objectContaining({ code: 'USDC' }),
        '100',
        '98'
      );
      expect(statusDisplay.setContent).toHaveBeenCalledWith(
        expect.stringContaining('Success!')
      );
    });
  });

  describe('Token resolution via registry (#495)', () => {
    it('resolves USDC on testnet to its real, derived SAC contract address instead of a placeholder', async () => {
      (soroswapService.getQuote as jest.MockedFunction<(...args: any[]) => Promise<any>>).mockResolvedValue({
        amountOut: '99',
        minimumReceived: '98',
      });
      (soroswapService.executeSwap as jest.MockedFunction<(...args: any[]) => Promise<any>>).mockResolvedValue({ hash: 'abc123' });

      createPanel('testnet');
      const walletInput = textboxAt(0);
      const amountInput = textboxAt(3);

      submitHandler(walletInput)(VALID_WALLET_ADDRESS);
      submitHandler(amountInput)('10');

      const swapPress = submitHandler(button(), 'press');
      await swapPress('');
      await flushAsync();

      const expectedContractId = deriveAssetContractId(
        'USDC',
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        'testnet'
      );
      // Never the invalid, hard-coded placeholder from before the fix.
      expect(expectedContractId).not.toBe(
        'GCTZ7STRRFS7I6N65QG6O7T7LFS7I6N65QG6O7T7LFS7I6N65QG6O7T7'
      );

      expect(soroswapService.executeSwap).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ code: 'USDC', issuer: expectedContractId }),
        expect.anything(),
        expect.anything()
      );
    });

    it('reports a clear error for an unknown token symbol instead of resolving to a fake issuer', async () => {
      createPanel();
      const walletInput = textboxAt(0);
      const amountInput = textboxAt(3);
      const tokenOutInput = textboxAt(2);
      const statusDisplay = textAt(6);

      submitHandler(walletInput)(VALID_WALLET_ADDRESS);
      submitHandler(amountInput)('10');
      submitHandler(tokenOutInput)('NOTAREALTOKEN');

      const swapPress = submitHandler(button(), 'press');
      await swapPress('');
      await flushAsync();

      expect(soroswapService.executeSwap).not.toHaveBeenCalled();
      expect(statusDisplay.setContent).toHaveBeenCalledWith(
        expect.stringContaining('Unknown token')
      );
    });
  });
});