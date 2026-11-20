/**
 * @fileoverview SSRF guard: rejects webhook URLs that target private / reserved
 *               IP space, loopback, link-local, CGNAT, multicast, or unspecified
 *               addresses — both at literal-URL validation time and at DNS
 *               resolution time just before a request is sent.
 *
 * Environment escape hatch (never in production):
 *   MONITORING_WEBHOOK_ALLOW_PRIVATE=true
 *
 * @author Galaxy DevKit Team
 * @since  2026-07-01
 */

import { promises as dns } from 'dns';

// ── Private-range check ───────────────────────────────────────────────────────

interface Ipv4Block { base: number; mask: number }

/**
 * All IPv4 ranges that must never receive outbound webhook traffic.
 * Sources: RFC 1122, 1918, 3927, 5737, 6598, 2544 (benchmark), 919 (broadcast).
 */
const BLOCKED_IPV4_BLOCKS: Ipv4Block[] = [
  // Loopback
  { base: ip4('127.0.0.0'),   mask: 0xff000000 }, // 127.0.0.0/8
  // Private
  { base: ip4('10.0.0.0'),    mask: 0xff000000 }, // 10.0.0.0/8
  { base: ip4('172.16.0.0'),  mask: 0xfff00000 }, // 172.16.0.0/12
  { base: ip4('192.168.0.0'), mask: 0xffff0000 }, // 192.168.0.0/16
  // Link-local (includes AWS/GCP metadata endpoint 169.254.169.254)
  { base: ip4('169.254.0.0'), mask: 0xffff0000 }, // 169.254.0.0/16
  // CGNAT
  { base: ip4('100.64.0.0'),  mask: 0xffc00000 }, // 100.64.0.0/10
  // Shared address space / test networks
  { base: ip4('192.0.2.0'),   mask: 0xffffff00 }, // 192.0.2.0/24    TEST-NET-1
  { base: ip4('198.51.100.0'),mask: 0xffffff00 }, // 198.51.100.0/24 TEST-NET-2
  { base: ip4('203.0.113.0'), mask: 0xffffff00 }, // 203.0.113.0/24  TEST-NET-3
  { base: ip4('192.88.99.0'), mask: 0xffffff00 }, // 192.88.99.0/24  6to4 relay (deprecated)
  // Benchmark (RFC 2544)
  { base: ip4('198.18.0.0'),  mask: 0xfffe0000 }, // 198.18.0.0/15
  // Multicast
  { base: ip4('224.0.0.0'),   mask: 0xf0000000 }, // 224.0.0.0/4
  // Reserved / broadcast
  { base: ip4('240.0.0.0'),   mask: 0xf0000000 }, // 240.0.0.0/4
  { base: ip4('255.255.255.255'), mask: 0xffffffff },
  // Unspecified
  { base: ip4('0.0.0.0'),     mask: 0xff000000 }, // 0.0.0.0/8
];

function ip4(dotted: string): number {
  const parts = dotted.split('.').map(Number);
  // Treat the result as an unsigned 32-bit integer via >>> 0
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Returns true when the dotted-decimal IPv4 string is in a blocked range. */
function isBlockedIpv4(addr: string): boolean {
  const n = ip4(addr) >>> 0;
  return BLOCKED_IPV4_BLOCKS.some(({ base, mask }) => (n & mask) >>> 0 === base >>> 0);
}

/**
 * Returns true when the IPv6 address (from Node's dns.resolve / os.networkInterfaces)
 * is in a blocked range.
 *
 * Covers:
 *  ::1              loopback
 *  ::               unspecified
 *  fc00::/7         ULA (fc00:: – fdff::)
 *  fe80::/10        link-local
 *  ff00::/8         multicast
 *  ::ffff:0:0/96    IPv4-mapped — the embedded IPv4 is re-checked
 *  64:ff9b::/96     NAT64 — the embedded IPv4 is re-checked
 */
function isBlockedIpv6(addr: string): boolean {
  // Normalise: strip zone ID (%eth0) and surrounding brackets
  const bare = addr.replace(/^[[\]]/g, '').replace(/%.*$/, '').toLowerCase();

  if (bare === '::1' || bare === '::') return true;

  // Expand shorthand so we can inspect individual groups
  const groups = expandIpv6(bare);
  if (!groups) return false;

  const first16 = groups[0];
  const first8  = first16 >> 8;

  // ULA  fc00::/7  → first byte is 0xfc or 0xfd
  if (first8 === 0xfc || first8 === 0xfd) return true;
  // Link-local  fe80::/10  → first16 is 0xfe80–0xfebf
  if ((first16 & 0xffc0) === 0xfe80) return true;
  // Multicast  ff00::/8
  if (first8 === 0xff) return true;

  // IPv4-mapped  ::ffff:0:0/96  — groups[0..4] are 0, groups[5] is 0xffff
  if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) {
    const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isBlockedIpv4(ipv4);
  }

  // NAT64  64:ff9b::/96
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every(g => g === 0)) {
    const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isBlockedIpv4(ipv4);
  }

  return false;
}

/**
 * Expands a full or compressed IPv6 address into an array of 8 × 16-bit groups.
 * Handles the mixed IPv4-in-IPv6 notation (e.g. `::ffff:127.0.0.1`) where the
 * last 32 bits are written as a dotted-decimal IPv4 address.
 * Returns null if the address cannot be parsed.
 */
function expandIpv6(addr: string): number[] | null {
  // Check for a dotted-decimal IPv4 suffix (e.g. "::ffff:192.168.1.1")
  const ipv4SuffixMatch = addr.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipv4SuffixMatch) {
    const prefix = ipv4SuffixMatch[1];
    const ipv4Parts = ipv4SuffixMatch[2].split('.').map(Number);
    const v4High = (ipv4Parts[0] << 8) | ipv4Parts[1];
    const v4Low  = (ipv4Parts[2] << 8) | ipv4Parts[3];

    // Expand the pure-IPv6 prefix (which needs 6 groups) then append the two v4 groups.
    const halves = prefix.split('::');
    if (halves.length > 2) return null;
    const left  = halves[0] ? halves[0].split(':').map(h => parseInt(h, 16)) : [];
    const right = halves[1] ? halves[1].split(':').map(h => parseInt(h, 16)) : [];
    // We need 6 hex groups total (the remaining 2 come from the IPv4 suffix).
    const fill  = new Array<number>(6 - left.length - right.length).fill(0);
    const groups = [...left, ...fill, ...right, v4High, v4Low];
    if (groups.length !== 8) return null;
    return groups;
  }

  const halves = addr.split('::');
  if (halves.length > 2) return null;

  const left  = halves[0] ? halves[0].split(':').map(h => parseInt(h, 16)) : [];
  const right = halves[1] ? halves[1].split(':').map(h => parseInt(h, 16)) : [];
  const fill  = new Array<number>(8 - left.length - right.length).fill(0);

  const groups = [...left, ...fill, ...right];
  if (groups.length !== 8) return null;
  return groups;
}

/** Returns true for any IP address (v4 or v6) that must be blocked. */
export function isPrivateOrReservedIp(addr: string): boolean {
  // Simple heuristic: v6 addresses contain ':'.
  return addr.includes(':') ? isBlockedIpv6(addr) : isBlockedIpv4(addr);
}

// ── Hostname / literal-IP detection ──────────────────────────────────────────

const LOCALHOST_RE = /^(localhost|ip6-localhost|ip6-loopback)$/i;

/**
 * Returns true when the hostname portion of a URL is a literal IP address
 * (v4 or v6) or a well-known loopback alias.
 */
function isLiteralIpOrLocalhost(hostname: string): boolean {
  if (LOCALHOST_RE.test(hostname)) return true;
  // Strip brackets from IPv6 literals: [::1] → ::1
  const bare = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  // IPv4: four dot-separated decimal octets
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return true;
  // IPv6: contains a colon
  if (bare.includes(':')) return true;
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Thrown by both the synchronous literal check and the async DNS check. */
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

function isPrivateBypassAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE === 'true';
}

/**
 * Synchronous check: reject literal IPs and localhost at validation time so
 * the user gets an immediate error from the Joi validator rather than at send
 * time. Throws {@link SsrfBlockedError} on rejection.
 */
export function assertNotLiteralPrivateUrl(rawUrl: string): void {
  if (isPrivateBypassAllowed()) return;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // Let Joi's own uri() validator report malformed URLs.
    return;
  }

  const hostname = parsed.hostname;

  if (isLiteralIpOrLocalhost(hostname)) {
    throw new SsrfBlockedError(
      `Webhook URL hostname "${hostname}" resolves to a private/reserved address and is not allowed`
    );
  }
}

/**
 * Async check: resolve the hostname with DNS right before making the request
 * and reject any address that falls in a private/reserved range.
 * Throws {@link SsrfBlockedError} on rejection.
 */
export async function assertWebhookUrlSafe(rawUrl: string): Promise<void> {
  if (isPrivateBypassAllowed()) return;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`Malformed webhook URL: ${rawUrl}`);
  }

  const hostname = parsed.hostname;

  // Literal IPs — no DNS round-trip needed
  const bare = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  const isLiteral =
    LOCALHOST_RE.test(hostname) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) ||
    bare.includes(':');

  if (isLiteral) {
    if (isPrivateOrReservedIp(bare)) {
      throw new SsrfBlockedError(
        `Webhook URL hostname "${hostname}" is a private/reserved address and is not allowed`
      );
    }
    return;
  }

  // Hostname — resolve and inspect every returned address
  let addresses: string[];
  try {
    // lookup() respects /etc/hosts; resolve4/resolve6 goes to the DNS server.
    // We call both to cover dual-stack hosts.
    const [v4, v6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);

    addresses = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];

    // If neither resolved, let the fetch attempt fail naturally (DNS NXDOMAIN).
    if (addresses.length === 0) return;
  } catch {
    return;
  }

  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr)) {
      throw new SsrfBlockedError(
        `Webhook URL hostname "${hostname}" resolves to a private/reserved address (${addr}) and is not allowed`
      );
    }
  }
}
