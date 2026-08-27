/**
 * @fileoverview Contract address prediction utilities
 * @description Deterministic Soroban contract ID computation per CAP-46
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Address, StrKey, hash, xdr } from '@stellar/stellar-sdk';

const SALT_LENGTH_BYTES = 32;

/**
 * Normalize a caller-supplied salt into the raw 32-byte buffer required by
 * `ContractIdPreimageFromAddress`.
 *
 * - `Buffer`/`Uint8Array` must already be exactly 32 bytes.
 * - `string` is hashed with SHA-256 so arbitrary-length input still yields a
 *   valid, deterministic 32-byte salt.
 * - `xdr.ScVal` must wrap exactly 32 bytes (`scvBytes`).
 * - `undefined` is rejected: a predicted address without a salt is not a
 *   meaningful, deterministic value.
 *
 * @throws {Error} If the salt cannot be normalized to 32 bytes.
 */
export function normalizeSalt(salt: string | Buffer | xdr.ScVal): Buffer {
  if (Buffer.isBuffer(salt)) {
    if (salt.length !== SALT_LENGTH_BYTES) {
      throw new Error(
        `Salt must be exactly ${SALT_LENGTH_BYTES} bytes, got ${salt.length}`
      );
    }
    return salt;
  }

  if (typeof salt === 'string') {
    return hash(Buffer.from(salt, 'utf8'));
  }

  if (salt instanceof xdr.ScVal) {
    if (salt.switch() !== xdr.ScValType.scvBytes()) {
      throw new Error(
        `Salt ScVal must be of type scvBytes, got ${salt.switch().name}`
      );
    }
    const bytes = salt.bytes();
    if (bytes.length !== SALT_LENGTH_BYTES) {
      throw new Error(
        `Salt must be exactly ${SALT_LENGTH_BYTES} bytes, got ${bytes.length}`
      );
    }
    return bytes;
  }

  throw new Error('Unsupported salt type: expected string, Buffer, or xdr.ScVal');
}

/**
 * Deterministically compute the contract id that
 * `CreateContractArgs`/`CreateContractArgsV2` with a `ContractIdPreimageFromAddress`
 * preimage will produce on-chain, per CAP-46.
 *
 * The same `deployerPublicKey` + `salt` + `networkPassphrase` always returns
 * the same `C...` strkey; changing any of the three inputs changes the result.
 *
 * @throws {Error} If the salt cannot be normalized to 32 bytes.
 */
export function predictContractAddress(
  deployerPublicKey: string,
  salt: string | Buffer | xdr.ScVal,
  networkPassphrase: string
): string {
  const saltBuffer = normalizeSalt(salt);
  const networkId = hash(Buffer.from(networkPassphrase, 'utf8'));

  const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: new Address(deployerPublicKey).toScAddress(),
      salt: saltBuffer,
    })
  );

  const hashIdPreimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId,
      contractIdPreimage,
    })
  );

  const contractIdHash = hash(hashIdPreimage.toXDR());
  return StrKey.encodeContract(contractIdHash);
}
