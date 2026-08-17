import { getJwtExpiryMs, isJwtExpired } from './token-expiry';

function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp })).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('token-expiry', () => {
  it('reads exp from a jwt payload as milliseconds', () => {
    const exp = 1_700_000_000;
    expect(getJwtExpiryMs(jwtWithExp(exp))).toBe(exp * 1000);
  });

  it('returns null for missing tokens and non-jwt credentials', () => {
    expect(getJwtExpiryMs('')).toBeNull();
    expect(getJwtExpiryMs('not-a-jwt')).toBeNull();
    expect(getJwtExpiryMs('a.b')).toBeNull();
  });

  it('treats a past exp as expired and a future exp as valid', () => {
    const now = 1_700_000_000_000;
    expect(isJwtExpired(jwtWithExp(now / 1000 - 10), now)).toBe(true);
    expect(isJwtExpired(jwtWithExp(now / 1000 + 60), now)).toBe(false);
  });

  it('does not treat api keys as expired locally', () => {
    expect(isJwtExpired('gk_live_abcdefghijklmnopqrstuvwxyz012345')).toBe(false);
  });
});
