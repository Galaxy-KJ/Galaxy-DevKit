/**
 * @fileoverview Soroswap Client Service
 * @description Frontend SDK wrapper for Soroswap Protocol integration
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { 
  SoroswapProtocol, 
  getSoroswapConfig 
} from '@galaxy-kj/core-defi-protocols';
import { 
  Asset, 
  SwapQuote, 
  TransactionResult 
} from '@galaxy-kj/core-defi-protocols';

/**
 * SoroswapClient handles the interaction between the UI and the Soroswap Protocol
 */
export class SoroswapClient {
  private protocol: SoroswapProtocol;

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    const config = getSoroswapConfig(network);
    this.protocol = new SoroswapProtocol(config);
  }

  /**
   * Initializes the protocol if not already done
   */
  public async initialize(): Promise<void> {
    await this.protocol.initialize();
  }

  /**
   * Fetches a swap quote for the given token pair and amount
   * @param tokenIn Source token
   * @param tokenOut Destination token
   * @param amountIn Amount of source token
   * @returns Promise<SwapQuote>
   */
  public async getQuote(
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string
  ): Promise<SwapQuote> {
    await this.initialize();
    return this.protocol.getSwapQuote(tokenIn, tokenOut, amountIn);
  }

  /**
   * Initiates a swap transaction
   * @param walletAddress User's wallet public key
   * @param tokenIn Source token
   * @param tokenOut Destination token
   * @param amountIn Amount of source token
   * @param minAmountOut Minimum amount of destination token to accept
   * @returns Promise<TransactionResult>
   */
  public async executeSwap(
    walletAddress: string,
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string,
    minAmountOut: string
  ): Promise<TransactionResult> {
    await this.initialize();
    // Private key is empty as we return unsigned XDR for the frontend to sign
    return this.protocol.swap(
      walletAddress,
      '',
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut
    );
  }
}

// Singleton instance for global use
export const soroswapService = new SoroswapClient();
