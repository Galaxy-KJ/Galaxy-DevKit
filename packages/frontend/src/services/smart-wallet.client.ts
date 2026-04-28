import { SmartWalletService } from '@galaxy-kj/core-wallet';
import { Networks } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

export interface WebAuthnCredential {
  credentialId: string;
  publicKey: string;
}

export class SmartWalletClient {
  private service: SmartWalletService;
  private rpcUrl: string;
  private network: string;

  constructor(
    rpcUrl: string = 'https://soroban-testnet.stellar.org',
    network: string = Networks.TESTNET
  ) {
    // We use the default WebAuthnProvider which works in the browser
    const mockProvider = { relyingPartyId: window.location.hostname };
    this.service = new SmartWalletService(mockProvider, rpcUrl, undefined, network);
    this.rpcUrl = rpcUrl;
    this.network = network;
  }

  /**
   * Triggers the WebAuthn passkey registration flow in the browser.
   */
  async registerPasskey(username: string = 'Galaxy User'): Promise<WebAuthnCredential> {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Galaxy DevKit',
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: username,
          displayName: username,
        },
        pubKeyCredParams: [
          {
            type: 'public-key',
            alg: -7, // ES256 (P-256)
          },
        ],
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'required',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Passkey registration failed');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKey = Buffer.from(response.getPublicKey()!).toString('base64');
    const credentialId = Buffer.from(credential.rawId).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Persist for SmartWalletService.deploy() which looks in localStorage
    const stored = localStorage.getItem('webauthn_credentials');
    const credentials = stored ? JSON.parse(stored) : [];
    credentials.unshift(credentialId);
    localStorage.setItem('webauthn_credentials', JSON.stringify(credentials));

    return { credentialId, publicKey };
  }

  /**
   * Deploys a new smart wallet using a registered passkey.
   */
  async deployWallet(publicKeyBase64: string): Promise<string> {
    const publicKeyBytes = Uint8Array.from(Buffer.from(publicKeyBase64, 'base64'));
    return await this.service.deploy(publicKeyBytes);
  }

  /**
   * Adds a new signer to an existing smart wallet.
   */
  async addSigner(
    walletAddress: string,
    signerCredentialId: string,
    signerPublicKey: string,
    authCredentialId: string
  ): Promise<string> {
    return await this.service.addSigner({
      walletAddress,
      signerCredentialId,
      signerPublicKey,
      authCredentialId,
    });
  }

  /**
   * Removes a signer from an existing smart wallet.
   */
  async removeSigner(
    walletAddress: string,
    signerCredentialId: string,
    authCredentialId: string
  ): Promise<string> {
    return await this.service.removeSigner({
      walletAddress,
      signerCredentialId,
      authCredentialId,
    });
  }

  /**
   * Gets the underlying SmartWalletService instance.
   */
  getService(): SmartWalletService {
    return this.service;
  }

  /**
   * Gets the configured RPC URL for this client.
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Gets the configured network for this client.
   */
  getNetwork(): string {
    return this.network;
  }
}
