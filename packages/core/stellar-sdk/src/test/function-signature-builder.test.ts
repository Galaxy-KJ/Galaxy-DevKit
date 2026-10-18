import { FunctionSignatureBuilder } from '../soroban/utils/function-signature-builder.js';

describe('FunctionSignatureBuilder', () => {
  it('hashes signatures as full SHA-256 hex digests', () => {
    const signatureBuilder = FunctionSignatureBuilder as unknown as {
      hashSignature: (signature: string) => string;
    };

    const hash = signatureBuilder.hashSignature(
      'transfer(Address,Address,i128)'
    );

    expect(hash).toBe(
      'ba5d4862d2ebda60b210f20c11dcbf85bceb649885da624dcfcff033681e99bc'
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});