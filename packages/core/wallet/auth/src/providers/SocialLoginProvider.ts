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
   * Extract the public key bytes from a WebAuthn credential.
   * The public key is encoded in the attestation object response.
   * 
   * IMPORTANT: This is a placeholder implementation.
   * In production, you would:
   * 1. Store the credential.response.getPublicKey() during registration
   * 2. Or parse the attestationObject from credential.response.attestationObject
   * 3. Extract the COSE public key and convert to raw 65-byte format (0x04 + x + y for ES256)
   * 
   * @param credentialId - The credential ID to look up
   * @returns 65-byte public key in uncompressed format
   * @private
   */
  private async extractPublicKey(credentialId: string): Promise<Uint8Array> {
    // PLACEHOLDER: Returns a mock 65-byte public key
    // Real implementation would:
    // 1. Parse attestationObject from the credential response
    // 2. Extract authData and decode CBOR
    // 3. Get credentialPublicKey from authData
    // 4. Convert COSE key to raw format
    
    // For now, return a placeholder that follows the correct format:
    // Byte 0: 0x04 (uncompressed point indicator for ES256)
    // Bytes 1-32: x coordinate (32 bytes)
    // Bytes 33-64: y coordinate (32 bytes)
    const publicKey = new Uint8Array(65);
    publicKey[0] = 0x04; // Uncompressed point indicator
    
    // Fill with deterministic but fake data for now
    // In production, this must be the actual public key from WebAuthn
    crypto.getRandomValues(publicKey.subarray(1));
    
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
