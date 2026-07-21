import { AuditEvent } from '../../audit-logger';
import { buildHashChain, verifyHashChain, GENESIS_HASH } from '../hash-chain';

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: '1',
    timestamp: '2026-07-20T00:00:00.000Z',
    user_id: 'user-1',
    action: 'wallet.transfer',
    resource: '/tx',
    ip_address: '1.2.3.4',
    success: true,
    ...overrides,
  };
}

describe('buildHashChain', () => {
  it('is deterministic for the same input events', () => {
    const events = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    const a = buildHashChain(events);
    const b = buildHashChain(events);
    expect(a.rootHash).toBe(b.rootHash);
    expect(a.entries[0].hash).toBe(b.entries[0].hash);
  });

  it('chains previousHash across entries starting from the genesis hash', () => {
    const events = [makeEvent({ id: '1' }), makeEvent({ id: '2' }), makeEvent({ id: '3' })];
    const { entries, rootHash } = buildHashChain(events);

    expect(entries[0].previousHash).toBe(GENESIS_HASH);
    expect(entries[1].previousHash).toBe(entries[0].hash);
    expect(entries[2].previousHash).toBe(entries[1].hash);
    expect(rootHash).toBe(entries[2].hash);
  });

  it('produces a different root hash when any field changes', () => {
    const events = [makeEvent({ id: '1' })];
    const { rootHash: rootA } = buildHashChain(events);
    const { rootHash: rootB } = buildHashChain([makeEvent({ id: '1', success: false })]);
    expect(rootA).not.toBe(rootB);
  });
});

describe('verifyHashChain', () => {
  it('validates an untampered chain', () => {
    const events = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    const { entries, rootHash } = buildHashChain(events);
    const result = verifyHashChain(entries, rootHash);
    expect(result.valid).toBe(true);
    expect(result.tamperedIndex).toBeNull();
  });

  it('detects a tampered field in an entry', () => {
    const events = [makeEvent({ id: '1' }), makeEvent({ id: '2' }), makeEvent({ id: '3' })];
    const { entries, rootHash } = buildHashChain(events);

    const tampered = entries.map((e, i) => (i === 1 ? { ...e, action: 'wallet.withdraw' } : e));
    const result = verifyHashChain(tampered, rootHash);

    expect(result.valid).toBe(false);
    expect(result.tamperedIndex).toBe(1);
  });

  it('detects a deleted entry', () => {
    const events = [makeEvent({ id: '1' }), makeEvent({ id: '2' }), makeEvent({ id: '3' })];
    const { entries, rootHash } = buildHashChain(events);

    const withDeletion = [entries[0], entries[2]];
    const result = verifyHashChain(withDeletion, rootHash);

    expect(result.valid).toBe(false);
  });

  it('detects reordered entries', () => {
    const events = [makeEvent({ id: '1' }), makeEvent({ id: '2' })];
    const { entries, rootHash } = buildHashChain(events);

    const reordered = [entries[1], entries[0]];
    const result = verifyHashChain(reordered, rootHash);

    expect(result.valid).toBe(false);
  });
});
