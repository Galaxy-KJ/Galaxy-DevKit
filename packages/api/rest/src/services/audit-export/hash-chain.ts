/**
 * @fileoverview SHA-256 hash-chain utilities for tamper-evident audit exports.
 * @description Each entry's hash is derived from the previous entry's hash
 *              plus its own canonical fields, so altering, reordering, or
 *              removing any entry breaks every hash from that point forward.
 *              The last entry's hash is the "chain root hash" and is stored
 *              alongside the export as the single value needed to prove
 *              the whole export is unmodified.
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

import { createHash } from 'crypto';
import { AuditEvent } from '../audit-logger';

export const GENESIS_HASH = '0'.repeat(64);

export interface ChainedAuditEvent extends AuditEvent {
  previousHash: string;
  hash: string;
}

export interface HashChainResult {
  entries: ChainedAuditEvent[];
  rootHash: string;
}

/** Canonical, order-stable representation of the fields covered by the hash. */
function canonicalize(event: AuditEvent): string {
  return JSON.stringify({
    id: event.id,
    timestamp: event.timestamp,
    user_id: event.user_id,
    organization_id: event.organization_id ?? null,
    action: event.action,
    resource: event.resource,
    resource_id: event.resource_id ?? null,
    ip_address: event.ip_address,
    success: event.success,
    error_code: event.error_code ?? null,
    severity: event.severity ?? 'info',
    correlation_id: event.correlation_id ?? null,
    metadata: event.metadata ?? null,
  });
}

export function computeEntryHash(previousHash: string, event: AuditEvent): string {
  return createHash('sha256').update(previousHash).update(canonicalize(event)).digest('hex');
}

/**
 * Builds a hash chain over `events` in the given order. Callers must pass
 * events in a stable, deterministic order (e.g. ascending timestamp) since
 * the chain is order-sensitive by design.
 */
export function buildHashChain(
  events: AuditEvent[],
  genesisHash: string = GENESIS_HASH
): HashChainResult {
  let previousHash = genesisHash;
  const entries: ChainedAuditEvent[] = events.map((event) => {
    const hash = computeEntryHash(previousHash, event);
    const entry: ChainedAuditEvent = { ...event, previousHash, hash };
    previousHash = hash;
    return entry;
  });

  return { entries, rootHash: previousHash };
}

export interface ChainVerificationResult {
  valid: boolean;
  /** Index of the first entry whose stored hash no longer matches its recomputed hash, or null if none. */
  tamperedIndex: number | null;
  expectedRootHash: string;
  actualRootHash: string;
}

/**
 * Recomputes the hash chain from the raw fields of each entry and compares
 * it against the hashes stored on the entries themselves and the expected
 * root hash. Detects insertion, deletion, reordering, and field tampering.
 */
export function verifyHashChain(
  entries: ChainedAuditEvent[],
  expectedRootHash: string,
  genesisHash: string = GENESIS_HASH
): ChainVerificationResult {
  let previousHash = genesisHash;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const recomputedHash = computeEntryHash(previousHash, entry);

    if (entry.previousHash !== previousHash || entry.hash !== recomputedHash) {
      return {
        valid: false,
        tamperedIndex: i,
        expectedRootHash,
        actualRootHash: recomputedHash,
      };
    }

    previousHash = recomputedHash;
  }

  return {
    valid: previousHash === expectedRootHash,
    tamperedIndex: previousHash === expectedRootHash ? null : entries.length - 1,
    expectedRootHash,
    actualRootHash: previousHash,
  };
}
