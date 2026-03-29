/**
 * @fileoverview Checksum Utilities
 * @description SHA-256 checksum generation and verification
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import * as crypto from 'crypto';

export function generateChecksum(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function verifyChecksum(data: string | Buffer, expectedChecksum: string): boolean {
  const actualChecksum = generateChecksum(data);
  return crypto.timingSafeEqual(
    Buffer.from(actualChecksum, 'hex'),
    Buffer.from(expectedChecksum, 'hex')
  );
}

export function generateShortChecksum(data: string | Buffer, length: number = 8): string {
  return generateChecksum(data).substring(0, length);
}

export function generateHMAC(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

export function verifyHMAC(data: string, expectedHMAC: string, key: string): boolean {
  const actualHMAC = generateHMAC(data, key);
  if (actualHMAC.length !== expectedHMAC.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(actualHMAC, 'hex'),
    Buffer.from(expectedHMAC, 'hex')
  );
}
