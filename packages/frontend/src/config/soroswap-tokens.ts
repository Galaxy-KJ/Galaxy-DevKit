/**
 * @fileoverview Known Soroswap token registry
 * @description Per-network list of tokens the Soroswap swap panel can resolve
 *   by symbol, keyed by their classic Stellar asset (code + issuer). The
 *   Soroswap protocol layer (`SoroswapProtocol.resolveTokenAddress`) needs
 *   the Stellar Asset Contract (SAC) address for any non-native asset, so
 *   callers should derive that address with `deriveAssetContractId` rather
 *   than passing the classic issuer straight through.
 */

import { Asset as StellarAsset, Networks } from '@stellar/stellar-sdk';

export type SoroswapNetwork = 'testnet' | 'mainnet';

/** A token identified by its classic Stellar asset (code + issuing account). */
export interface KnownToken {
  code: string;
  issuer: string;
}

/**
 * Known tokens on Stellar Testnet.
 * USDC issuer is Circle's official testnet USDC issuing account, the same
 * one already relied on elsewhere in this app (see the "USDC issuer" status
 * tile in `app.ts` and the USDC option in `panels/blend.ts`).
 */
export const SOROSWAP_TESTNET_TOKENS: Record<string, KnownToken> = {
  USDC: { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
};

/**
 * Known tokens on Stellar Mainnet.
 * USDC issuer is Circle's official mainnet USDC issuing account, the same
 * one already relied on throughout `core/defi-protocols` (e.g.
 * `aggregator/router.ts`, `services/smart-router.ts`).
 */
export const SOROSWAP_MAINNET_TOKENS: Record<string, KnownToken> = {
  USDC: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
};

/** Look up a known token by symbol (case-insensitive) for a given network. */
export function getKnownToken(symbol: string, network: SoroswapNetwork): KnownToken | undefined {
  const registry = network === 'mainnet' ? SOROSWAP_MAINNET_TOKENS : SOROSWAP_TESTNET_TOKENS;
  return registry[symbol.toUpperCase()];
}

/** List the symbols this registry knows about for a given network (for error messages). */
export function listKnownSymbols(network: SoroswapNetwork): string[] {
  const registry = network === 'mainnet' ? SOROSWAP_MAINNET_TOKENS : SOROSWAP_TESTNET_TOKENS;
  return ['XLM', ...Object.keys(registry)];
}

/**
 * Derive a classic asset's Stellar Asset Contract (SAC) address for a given
 * network, the same derivation `SoroswapProtocol` uses for native XLM
 * (`Asset.native().contractId(passphrase)`), generalized to any asset. This
 * is computed, not guessed: it's deterministic from the asset's code,
 * issuer and the network passphrase, so it can't drift from whatever the
 * real SAC address is.
 */
export function deriveAssetContractId(code: string, issuer: string, network: SoroswapNetwork): string {
  const passphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  return new StellarAsset(code, issuer).contractId(passphrase);
}