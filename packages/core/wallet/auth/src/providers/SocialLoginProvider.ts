import { WebAuthNProvider } from './WebAuthNProvider';
import { BiometricType } from '../BiometricAuth';

/** localStorage key prefix for the userId -> credentialId[] mapping. */
const USER_CREDENTIALS_KEY_PREFIX = 'webauthn_user_credentials_';

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

    // Record which credential belongs to this user, so a later login() can
    // scope the WebAuthn assertion to only this user's own credential(s)
    // instead of picking an arbitrary one off the device.
    this.addUserCredentialId(userId, credential.id);

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
   * The assertion is scoped to the credential(s) on record for `userId` (via
   * `allowCredentials`), and the credential the assertion actually resolves
   * to is checked against that same record. A device with multiple
   * onboarded users therefore can't bind a login as one user to another
   * user's credential or smart wallet.
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
    const allowedCredentialIds = this.getUserCredentialIds(userId);

    if (allowedCredentialIds.length === 0) {
      throw new Error(
        `No credentials found for user "${userId}". Please onboard first.`
      );
    }

    // Scope the WebAuthn assertion to this user's own credential(s), so the
    // platform authenticator (and the user) can't pick a passkey belonging
    // to someone else on a shared device.
    const authResult = await this.webAuthnProvider.authenticate(
      `Authenticate as ${userId}`,
      allowedCredentialIds
    );

    if (!authResult.success) {
      throw new Error(
        authResult.error || 'WebAuthn authentication failed'
      );
    }

    const credentialId = authResult.credentialId;
    if (!credentialId) {
      throw new Error(
        'WebAuthn authentication succeeded but did not return a credential id'
      );
    }

    // Defense in depth: `allowCredentials` scopes the browser prompt, but
    // don't trust it alone. Reject outright if the asserted credential is
    // not actually one we recorded for this userId.
    if (!allowedCredentialIds.includes(credentialId)) {
      throw new Error(
        `Asserted credential "${credentialId}" does not belong to user "${userId}"`
      );
    }

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
   * Get the credential IDs on record for a given userId.
   *
   * This is a localStorage-keyed stand-in for the backend `smart_wallets`
   * mapping the issue describes; either way, the point is that `login()`
   * never has to guess which credential belongs to which user.
   *
   * @private
   */
  private getUserCredentialIds(userId: string): string[] {
    const stored = localStorage.getItem(this.userCredentialsKey(userId));
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Record a credential ID as belonging to a userId.
   * @private
   */
  private addUserCredentialId(userId: string, credentialId: string): void {
    const ids = this.getUserCredentialIds(userId);
    if (!ids.includes(credentialId)) {
      ids.push(credentialId);
      localStorage.setItem(this.userCredentialsKey(userId), JSON.stringify(ids));
    }
  }

  private userCredentialsKey(userId: string): string {
    return `${USER_CREDENTIALS_KEY_PREFIX}${userId}`;
  }
}