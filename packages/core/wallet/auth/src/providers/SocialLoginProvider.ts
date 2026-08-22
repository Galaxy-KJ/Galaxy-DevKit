import { WebAuthNProvider } from './WebAuthNProvider';
import { BiometricType } from '../BiometricAuth';

/**
 * SocialLoginProvider bridges OAuth identity with WebAuthn passkey onboarding.
 * 
 * OAuth JWT identifies the user (handled upstream, userId passed in).
 * WebAuthn passkey protects the Stellar private key on-device.
 * These are two separate security layers.
 * 
 * CRITICAL: This class does NOT derive keys from OAuth tokens.
 * The JWT is verified upstream; this class only receives userId.
 */
export class SocialLoginProvider {
  constructor(private webAuthnProvider: WebAuthNProvider) {}

  /**
   * Onboard a new user after OAuth success.
   * Registers a WebAuthn credential and extracts the public key.
   * 
   * @param userId - User identifier from OAuth provider (e.g., Supabase user_id)
   * @returns Object containing userId, credentialId, and the 65-byte public key
   * 
   * @example
   * const result = await socialLogin.onboard('user-123-from-google');
   * // result.publicKey65Bytes can be stored in Supabase for verification
   */
  async onboard(userId: string): Promise<{
    userId: string;
    credentialId: string;
    publicKey65Bytes: Uint8Array;
  }> {
    // Register a new WebAuthn credential
    // Using 'any' biometric type to allow platform authenticator to choose
    const credential = await this.webAuthnProvider.registerCredential('any' as BiometricType);

    // Extract public key from the credential
    // The public key is needed to verify future authentications
    const publicKey65Bytes = await this.extractPublicKey(credential.id);

    return {
      userId,
      credentialId: credential.id,
      publicKey65Bytes,
    };
  }

  /**
   * Authenticate a returning user after OAuth success.
   * Verifies the WebAuthn credential to unlock access.
   * 
   * @param userId - User identifier from OAuth provider
   * @returns Object containing userId and credentialId
   * 
   * @example
   * const result = await socialLogin.login('user-123-from-google');
   * // Backend verifies both OAuth JWT and WebAuthn credential
   */
  async login(userId: string): Promise<{
    userId: string;
    credentialId: string;
  }> {
    // Authenticate with existing WebAuthn credential
    const authResult = await this.webAuthnProvider.authenticate(
      `Authenticate as ${userId}`
    );

    if (!authResult.success) {
      throw new Error(
        authResult.error || 'WebAuthn authentication failed'
      );
    }

    // Retrieve the credential ID from stored credentials
    // In a real implementation, this should be fetched from backend based on userId
    const credentialIds = this.getStoredCredentialIds();
    
    if (credentialIds.length === 0) {
      throw new Error('No credentials found. Please onboard first.');
    }

    // For now, return the first credential
    // In production, map userId to specific credentialId via backend
    const credentialId = credentialIds[0];

    return {
      userId,
      credentialId,
    };
  }

  /**
   * Extract the public key bytes for a WebAuthn credential.
   *
   * The real key is extracted and verified by `WebAuthNProvider.registerCredential()`
   * at registration time (via `extractPublicKey()` + a signature self-check) and
   * persisted alongside the credential id. This just reads it back from that shared
   * storage so it never has to be re-derived.
   *
   * @param credentialId - The credential ID to look up
   * @returns 65-byte public key in uncompressed format
   * @private
   */
  private async extractPublicKey(credentialId: string): Promise<Uint8Array> {
    const publicKey = this.webAuthnProvider.getStoredPublicKey(credentialId);

    if (!publicKey) {
      throw new Error(
        `SocialLoginProvider: no public key found for credential "${credentialId}". ` +
        'The credential must be registered via WebAuthNProvider.registerCredential() first.'
      );
    }

    return publicKey;
  }

  /**
   * Get stored credential IDs from localStorage.
   * This mirrors the WebAuthNProvider's internal storage.
   * 
   * @private
   */
  private getStoredCredentialIds(): string[] {
    const stored = localStorage.getItem('webauthn_credentials');
    return stored ? JSON.parse(stored) : [];
  }
}
