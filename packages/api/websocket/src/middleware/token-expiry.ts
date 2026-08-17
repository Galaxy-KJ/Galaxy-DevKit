/**
 * Local JWT expiry helpers.
 *
 * Long-lived sockets should drop expired sessions without a Supabase
 * round trip on every tick. Decode `exp` from the payload only.
 * Signature checks stay in validateToken / periodic revalidation.
 */

export function getJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      exp?: unknown;
    };

    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return null;
    }

    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Returns true only when a JWT payload is present and already expired.
 * Non-JWT credentials (API keys) return false so the slow-path verifier
 * remains the source of truth.
 */
export function isJwtExpired(token: string, now: number = Date.now()): boolean {
  const expiryMs = getJwtExpiryMs(token);
  if (expiryMs === null) {
    return false;
  }
  return expiryMs <= now;
}
