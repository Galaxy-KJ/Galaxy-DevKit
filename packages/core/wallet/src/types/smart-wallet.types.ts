/**
 * Thrown when a Soroban auth entry's signatureExpirationLedger is at or within
 * the configured expiration buffer of the current ledger sequence.
 */
export class SignatureExpiredException extends Error {
  constructor(
    public readonly expirationLedger: number,
    public readonly currentLedger: number
  ) {
    super(
      `Signature expires at ledger ${expirationLedger}, which is at or within the expiration buffer of the current ledger ${currentLedger}.`
    );
    this.name = 'SignatureExpiredException';
  }
}

export interface CredentialBackend {
  get(options: CredentialRequestOptions): Promise<PublicKeyCredential | null>;
  create?(
    options: CredentialCreationOptions
  ): Promise<PublicKeyCredential | null>;
}

export interface SmartWalletWebAuthnProvider {
  readonly relyingPartyId: string;
}

/**
 * USDC issuer addresses on Stellar.
 * Testnet: Circle's test USDC issuer.
 * Mainnet: Circle's production USDC issuer.
 */
export const USDC_ISSUERS = {
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
} as const;

export type USDCNetwork = keyof typeof USDC_ISSUERS;

/**
 * Options for deploy() when the caller wants to also prepare a USDC trustline
 * for the account during wallet creation.
 */
export interface DeployWithTrustlineOptions {
  autoTrustlineUSDC: true;
  /** The network to resolve the correct USDC issuer. */
  usdcNetwork: USDCNetwork;
  /** Classic Stellar G-address that will hold USDC. */
  accountId: string;
}

/**
 * Return value from deploy() when autoTrustlineUSDC is requested.
 * The trustlineXdr is an unsigned fee-less transaction XDR (base64)
 * intended for fee sponsorship — the account must still sign it.
 */
export interface DeployResult {
  contractAddress: string;
  trustlineXdr: string;
}
