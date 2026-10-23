/**
 * @fileoverview Soroswap Swap Panel
 * @description Interactive terminal UI for Soroswap token swaps
 * @author Galaxy DevKit Team
 */

import blessed from 'blessed';
import { StrKey } from '@stellar/stellar-sdk';
import { soroswapService } from '../services/soroswap.client.js';
import { Asset } from '@galaxy-kj/core-defi-protocols';
import {
  SoroswapNetwork,
  deriveAssetContractId,
  getKnownToken,
  listKnownSymbols,
} from '../config/soroswap-tokens.js';

export interface SoroswapPanelOptions {
  screen: blessed.Widgets.Screen;
  grid: any; // contrib.grid
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  network?: 'testnet' | 'mainnet';
}

const NOT_CONNECTED_MESSAGE = 'Connect a wallet to swap (enter its address above)';

/**
 * Validates a smart wallet contract address, the same lightweight format
 * check `WalletConnectorService.validateContractAddress` applies: must be
 * non-empty and a valid bech32 "C..." contract strkey. This panel doesn't
 * verify the contract exists on-chain — that's `WalletConnectorService`'s
 * job — just that what the user typed could plausibly be a wallet address.
 */
function validateWalletAddress(address: string): string | undefined {
  if (!address || address.trim().length === 0) {
    return 'Wallet address is required';
  }
  if (!address.startsWith('C')) {
    return 'Wallet address must be a smart wallet contract address (starts with "C")';
  }
  try {
    StrKey.decodeContract(address);
    return undefined;
  } catch {
    return 'Invalid wallet address format';
  }
}

/**
 * SoroswapPanel creates an interactive swap interface in the terminal
 */
export class SoroswapPanel {
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  private network: SoroswapNetwork;

  // UI Elements
  private walletAddressInput!: blessed.Widgets.TextboxElement;
  private tokenInInput!: blessed.Widgets.TextboxElement;
  private tokenOutInput!: blessed.Widgets.TextboxElement;
  private amountInput!: blessed.Widgets.TextboxElement;
  private slippageInput!: blessed.Widgets.TextboxElement;
  private quoteDisplay!: blessed.Widgets.TextElement;
  private statusDisplay!: blessed.Widgets.TextElement;
  private swapButton!: blessed.Widgets.ButtonElement;

  // State
  private amount: string = '';
  private tokenIn: string = 'XLM'; // Default
  private tokenOut: string = 'USDC'; // Default
  private slippage: string = '0.5'; // Default 0.5%
  private walletAddress: string = '';
  private quoteTimeout: NodeJS.Timeout | null = null;

  constructor(options: SoroswapPanelOptions) {
    this.screen = options.screen;
    this.network = options.network || 'testnet';

    this.box = options.grid.set(
      options.row,
      options.col,
      options.rowSpan,
      options.colSpan,
      blessed.box,
      {
        label: ' Soroswap Swap ',
        border: { type: 'line', fg: 'cyan' },
        style: { fg: 'white' },
      }
    );

    this.setupUI();
  }

  private setupUI() {
    // Labels
    blessed.text({
      parent: this.box,
      top: 1,
      left: 2,
      content: 'Wallet Address (C...):',
      style: { fg: 'yellow' }
    });

    this.walletAddressInput = blessed.textbox({
      parent: this.box,
      top: 1,
      left: 26,
      width: 30,
      height: 1,
      inputOnFocus: true,
      border: { type: 'line' },
      style: { fg: 'white', focus: { border: { fg: 'blue' } } }
    });

    blessed.text({
      parent: this.box,
      top: 3,
      left: 2,
      content: 'From (Token A):',
      style: { fg: 'yellow' }
    });

    this.tokenInInput = blessed.textbox({
      parent: this.box,
      top: 3,
      left: 20,
      width: 15,
      height: 1,
      inputOnFocus: true,
      content: this.tokenIn,
      border: { type: 'line' },
      style: { fg: 'white', focus: { border: { fg: 'blue' } } }
    });

    blessed.text({
      parent: this.box,
      top: 5,
      left: 2,
      content: 'To (Token B):',
      style: { fg: 'yellow' }
    });

    this.tokenOutInput = blessed.textbox({
      parent: this.box,
      top: 5,
      left: 20,
      width: 15,
      height: 1,
      inputOnFocus: true,
      content: this.tokenOut,
      border: { type: 'line' },
      style: { fg: 'white', focus: { border: { fg: 'blue' } } }
    });

    blessed.text({
      parent: this.box,
      top: 7,
      left: 2,
      content: 'Amount:',
      style: { fg: 'yellow' }
    });

    this.amountInput = blessed.textbox({
      parent: this.box,
      top: 7,
      left: 20,
      width: 15,
      height: 1,
      inputOnFocus: true,
      border: { type: 'line' },
      style: { fg: 'white', focus: { border: { fg: 'blue' } } }
    });

    blessed.text({
      parent: this.box,
      top: 9,
      left: 2,
      content: 'Slippage (%):',
      style: { fg: 'yellow' }
    });

    this.slippageInput = blessed.textbox({
      parent: this.box,
      top: 9,
      left: 20,
      width: 15,
      height: 1,
      inputOnFocus: true,
      content: this.slippage,
      border: { type: 'line' },
      style: { fg: 'white', focus: { border: { fg: 'blue' } } }
    });

    // Quote Display
    this.quoteDisplay = blessed.text({
      parent: this.box,
      top: 11,
      left: 2,
      width: '90%',
      height: 3,
      content: 'Quote: -',
      style: { fg: 'green' }
    });

    // Status Display
    this.statusDisplay = blessed.text({
      parent: this.box,
      bottom: 2,
      left: 2,
      width: '90%',
      content: NOT_CONNECTED_MESSAGE,
      style: { fg: 'gray' }
    });

    // Swap Button
    this.swapButton = blessed.button({
      parent: this.box,
      bottom: 0,
      right: 2,
      width: 10,
      height: 1,
      content: ' [ SWAP ] ',
      align: 'center',
      style: {
        fg: 'black',
        bg: 'green',
        hover: { bg: 'white' },
        focus: { bg: 'white' }
      }
    });

    this.setupEvents();
    this.refreshSwapButtonState();
  }

  private setupEvents() {
    this.walletAddressInput.on('submit', (value) => {
      const trimmed = (value || '').trim();
      const error = validateWalletAddress(trimmed);
      if (error) {
        this.walletAddress = '';
        this.statusDisplay.setContent(`Error: ${error}`);
      } else {
        this.walletAddress = trimmed;
        this.statusDisplay.setContent('Wallet connected. Ready to swap.');
      }
      this.refreshSwapButtonState();
      this.screen.render();
    });

    this.amountInput.on('submit', (value) => {
      this.amount = value;
      this.triggerQuoteUpdate();
    });

    this.tokenInInput.on('submit', (value) => {
      this.tokenIn = value;
      this.triggerQuoteUpdate();
    });

    this.tokenOutInput.on('submit', (value) => {
      this.tokenOut = value;
      this.triggerQuoteUpdate();
    });

    this.slippageInput.on('submit', (value) => {
      this.slippage = value;
      this.triggerQuoteUpdate();
    });

    this.swapButton.on('press', () => {
      this.handleSwap();
    });

    // Global keys for navigation
    this.walletAddressInput.key('tab', () => this.tokenInInput.focus());
    this.amountInput.key('tab', () => this.slippageInput.focus());
    this.slippageInput.key('tab', () => this.tokenInInput.focus());
    this.tokenInInput.key('tab', () => this.tokenOutInput.focus());
    this.tokenOutInput.key('tab', () => this.amountInput.focus());
  }

  private triggerQuoteUpdate() {
    if (this.quoteTimeout) {
      clearTimeout(this.quoteTimeout);
    }

    if (!this.amount || isNaN(parseFloat(this.amount))) {
      this.quoteDisplay.setContent('Quote: -');
      this.screen.render();
      return;
    }

    this.statusDisplay.setContent('Fetching quote...');
    this.screen.render();

    this.quoteTimeout = setTimeout(async () => {
      await this.updateQuote();
    }, 500); // 500ms debounce
  }

  private async updateQuote() {
    try {
      const assetIn: Asset = this.resolveAsset(this.tokenIn);
      const assetOut: Asset = this.resolveAsset(this.tokenOut);

      const quote = await soroswapService.getQuote(assetIn, assetOut, this.amount);

      this.quoteDisplay.setContent(
        `Quote: ${quote.amountOut} ${this.tokenOut}\n` +
        `Min: ${quote.minimumReceived} (at ${this.slippage}% slippage)`
      );
      this.statusDisplay.setContent(
        this.isWalletConnected() ? 'Quote received' : NOT_CONNECTED_MESSAGE
      );
      this.screen.render();
    } catch (error: any) {
      this.quoteDisplay.setContent('Quote: Error fetching');
      this.statusDisplay.setContent(`Error: ${error.message}`);
      this.screen.render();
    }
  }

  private async handleSwap() {
    if (!this.isWalletConnected()) {
      this.statusDisplay.setContent(NOT_CONNECTED_MESSAGE);
      this.screen.render();
      return;
    }

    if (!this.amount) {
      this.statusDisplay.setContent('Error: Amount is required');
      this.screen.render();
      return;
    }

    try {
      this.statusDisplay.setContent('Initiating swap...');
      this.screen.render();

      const assetIn = this.resolveAsset(this.tokenIn);
      const assetOut = this.resolveAsset(this.tokenOut);

      // Fetch quote first to get minAmountOut with current slippage
      const quote = await soroswapService.getQuote(assetIn, assetOut, this.amount);

      const result = await soroswapService.executeSwap(
        this.walletAddress,
        assetIn,
        assetOut,
        this.amount,
        quote.minimumReceived
      );

      this.statusDisplay.setContent(`Success! TX: ${result.hash.substring(0, 10)}...`);
      this.screen.render();
    } catch (error: any) {
      this.statusDisplay.setContent(`Swap failed: ${error.message}`);
      this.screen.render();
    }
  }

  /** Whether a plausibly-valid wallet address has been entered. */
  private isWalletConnected(): boolean {
    return !validateWalletAddress(this.walletAddress);
  }

  /**
   * Reflects wallet-connection state on the swap button. The button is
   * still technically clickable (blessed has no native "disabled" state),
   * so `handleSwap` also refuses to run without a connected wallet — this
   * just makes that state visible.
   */
  private refreshSwapButtonState(): void {
    const connected = this.isWalletConnected();
    const style = (this.swapButton as any).style;
    if (style) {
      style.bg = connected ? 'green' : 'gray';
    }
    if (typeof (this.swapButton as any).setContent === 'function') {
      (this.swapButton as any).setContent(connected ? ' [ SWAP ] ' : ' [ LOCKED ] ');
    }
  }

  /**
   * Resolves a token symbol to the Asset shape `SoroswapClient` expects.
   * Non-native tokens are looked up in the per-network known-token
   * registry and resolved to their Stellar Asset Contract (SAC) address
   * (what `SoroswapProtocol.resolveTokenAddress` actually needs), instead
   * of a fabricated placeholder. Unknown symbols throw rather than
   * silently resolving to the wrong asset.
   */
  private resolveAsset(symbol: string): Asset {
    const upper = symbol.toUpperCase();
    if (upper === 'XLM') {
      return { code: 'XLM', type: 'native' };
    }

    const known = getKnownToken(upper, this.network);
    if (!known) {
      throw new Error(
        `Unknown token "${symbol}". Supported tokens: ${listKnownSymbols(this.network).join(', ')}`
      );
    }

    const contractId = deriveAssetContractId(known.code, known.issuer, this.network);

    return {
      code: known.code,
      type: 'credit_alphanum4',
      issuer: contractId,
    };
  }
}