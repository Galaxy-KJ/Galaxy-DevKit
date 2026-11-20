/**
 * @fileoverview Unit tests for the SSRF guard utility.
 */

import { jest } from '@jest/globals';
import { promises as dns } from 'dns';

// We need to mock dns before importing the module under test.
jest.mock('dns', () => ({
  promises: {
    resolve4: jest.fn(),
    resolve6: jest.fn(),
  },
}));

import {
  isPrivateOrReservedIp,
  assertNotLiteralPrivateUrl,
  assertWebhookUrlSafe,
  SsrfBlockedError,
} from '../ssrf-guard';

const mockResolve4 = dns.resolve4 as jest.MockedFunction<typeof dns.resolve4>;
const mockResolve6 = dns.resolve6 as jest.MockedFunction<typeof dns.resolve6>;

// Convenience: make resolve4 return one address, resolve6 NXDOMAIN.
function dnsReturns(ipv4: string[], ipv6: string[] = []): void {
  mockResolve4.mockResolvedValueOnce(ipv4 as unknown as Awaited<ReturnType<typeof dns.resolve4>>);
  if (ipv6.length > 0) {
    mockResolve6.mockResolvedValueOnce(ipv6 as unknown as Awaited<ReturnType<typeof dns.resolve6>>);
  } else {
    mockResolve6.mockRejectedValueOnce(new Error('ENOTFOUND'));
  }
}

// ── isPrivateOrReservedIp ─────────────────────────────────────────────────────

describe('isPrivateOrReservedIp', () => {
  describe('blocked IPv4 ranges', () => {
    test.each([
      ['127.0.0.1',       'loopback'],
      ['127.255.255.255', 'loopback top'],
      ['10.0.0.1',        '10/8'],
      ['10.255.255.254',  '10/8 top'],
      ['172.16.0.1',      '172.16/12'],
      ['172.31.255.254',  '172.31/12 top'],
      ['192.168.0.1',     '192.168/16'],
      ['192.168.255.254', '192.168/16 top'],
      ['169.254.169.254', 'link-local / metadata'],
      ['169.254.0.1',     'link-local'],
      ['100.64.0.1',      'CGNAT'],
      ['100.127.255.254', 'CGNAT top'],
      ['192.0.2.1',       'TEST-NET-1'],
      ['198.51.100.1',    'TEST-NET-2'],
      ['203.0.113.1',     'TEST-NET-3'],
      ['224.0.0.1',       'multicast'],
      ['239.255.255.255', 'multicast top'],
      ['240.0.0.1',       'reserved'],
      ['255.255.255.255', 'broadcast'],
      ['0.0.0.1',         'unspecified'],
    ])('blocks %s (%s)', (ip) => {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    });
  });

  describe('allowed IPv4 addresses', () => {
    test.each([
      ['1.1.1.1'],
      ['8.8.8.8'],
      ['104.16.0.1'],
      ['151.101.0.1'],
    ])('allows %s', (ip) => {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    });
  });

  describe('blocked IPv6 addresses', () => {
    test.each([
      ['::1',                    'loopback'],
      ['::',                     'unspecified'],
      ['fc00::1',                'ULA'],
      ['fdff:ffff:ffff:ffff::1', 'ULA top'],
      ['fe80::1',                'link-local'],
      ['febf::1',                'link-local top'],
      ['ff02::1',                'multicast'],
      ['::ffff:127.0.0.1',       'IPv4-mapped loopback'],
      ['::ffff:10.0.0.1',        'IPv4-mapped private'],
      ['::ffff:169.254.169.254', 'IPv4-mapped metadata endpoint'],
      ['::ffff:c0a8:0101',       'IPv4-mapped 192.168.1.1 (hex form)'],
    ])('blocks %s (%s)', (ip) => {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    });
  });

  describe('allowed IPv6 addresses', () => {
    test.each([
      ['2606:4700::1111'],  // Cloudflare
      ['2001:4860:4860::8888'], // Google
    ])('allows %s', (ip) => {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    });
  });
});

// ── assertNotLiteralPrivateUrl ────────────────────────────────────────────────

describe('assertNotLiteralPrivateUrl', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'production' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test.each([
    ['http://127.0.0.1/path',           'loopback v4'],
    ['https://127.0.0.1',               'loopback v4 https'],
    ['https://169.254.169.254/latest/meta-data', 'metadata endpoint'],
    ['https://[::1]',                   'loopback v6'],
    ['https://[::ffff:10.0.0.1]',       'IPv4-mapped private'],
    ['http://localhost',                 'localhost alias'],
    ['https://10.0.0.1',                'private 10/8'],
    ['https://192.168.1.100',           'private 192.168/16'],
  ])('throws for %s (%s)', (url) => {
    expect(() => assertNotLiteralPrivateUrl(url)).toThrow(SsrfBlockedError);
  });

  it('does not throw for a public hostname (relies on DNS check at send time)', () => {
    expect(() => assertNotLiteralPrivateUrl('https://hook.example.com/alerts')).not.toThrow();
  });

  it('allows private addresses when MONITORING_WEBHOOK_ALLOW_PRIVATE=true in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE = 'true';
    expect(() => assertNotLiteralPrivateUrl('http://127.0.0.1/test')).not.toThrow();
  });

  it('refuses MONITORING_WEBHOOK_ALLOW_PRIVATE=true when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE = 'true';
    expect(() => assertNotLiteralPrivateUrl('https://10.0.0.1')).toThrow(SsrfBlockedError);
  });
});

// ── assertWebhookUrlSafe ──────────────────────────────────────────────────────

describe('assertWebhookUrlSafe', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'production' };
    mockResolve4.mockReset();
    mockResolve6.mockReset();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('blocks a hostname that resolves to a 10.x address', async () => {
    dnsReturns(['10.0.0.1']);
    await expect(
      assertWebhookUrlSafe('https://internal.example.com/hook')
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks a hostname that resolves to a 192.168.x address', async () => {
    dnsReturns(['192.168.1.100']);
    await expect(
      assertWebhookUrlSafe('https://corp-internal.example.com/hook')
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks a hostname that resolves to the metadata endpoint (169.254.169.254)', async () => {
    dnsReturns(['169.254.169.254']);
    await expect(
      assertWebhookUrlSafe('https://metadata.test/latest')
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks a hostname that resolves to an IPv6 ULA address', async () => {
    dnsReturns([], ['fd00::1']);
    await expect(
      assertWebhookUrlSafe('https://ipv6-internal.example.com/hook')
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('allows a hostname that resolves to a public address', async () => {
    dnsReturns(['104.16.0.1']);
    await expect(
      assertWebhookUrlSafe('https://hook.example.com/alerts')
    ).resolves.not.toThrow();
  });

  it('allows when DNS returns NXDOMAIN (let the fetch fail naturally)', async () => {
    mockResolve4.mockRejectedValueOnce(new Error('ENOTFOUND'));
    mockResolve6.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(
      assertWebhookUrlSafe('https://no-such-host.example.com/hook')
    ).resolves.not.toThrow();
  });

  it('blocks a literal IPv4 loopback URL without DNS lookup', async () => {
    await expect(
      assertWebhookUrlSafe('https://127.0.0.1/secret')
    ).rejects.toThrow(SsrfBlockedError);
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  it('blocks a literal IPv6 loopback URL without DNS lookup', async () => {
    await expect(
      assertWebhookUrlSafe('https://[::1]/secret')
    ).rejects.toThrow(SsrfBlockedError);
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  it('allows private addresses when MONITORING_WEBHOOK_ALLOW_PRIVATE=true in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE = 'true';
    await expect(
      assertWebhookUrlSafe('http://127.0.0.1/test')
    ).resolves.not.toThrow();
    expect(mockResolve4).not.toHaveBeenCalled();
  });
});
