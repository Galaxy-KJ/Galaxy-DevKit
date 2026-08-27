/**
 * @fileoverview Unit tests for deterministic contract address prediction
 */

import { Keypair, StrKey, Networks, xdr } from '@stellar/stellar-sdk';
import {
  predictContractAddress,
  normalizeSalt,
} from '../soroban/utils/contract-address.js';
import { ContractFactory } from '../soroban/helpers/contract-factory.js';

describe('predictContractAddress', () => {
  const deployer = Keypair.random();
  const salt = Buffer.alloc(32, 7);

  it('returns a valid C... strkey', () => {
    const address = predictContractAddress(
      deployer.publicKey(),
      salt,
      Networks.TESTNET
    );

    expect(StrKey.isValidContract(address)).toBe(true);
  });

  it('is deterministic for the same inputs', () => {
    const first = predictContractAddress(
      deployer.publicKey(),
      salt,
      Networks.TESTNET
    );
    const second = predictContractAddress(
      deployer.publicKey(),
      salt,
      Networks.TESTNET
    );

    expect(first).toBe(second);
  });

  it('changes when the salt changes', () => {
    const first = predictContractAddress(
      deployer.publicKey(),
      salt,
      Networks.TESTNET
    );
    const second = predictContractAddress(
      deployer.publicKey(),
      Buffer.alloc(32, 9),
      Networks.TESTNET
    );

    expect(first).not.toBe(second);
  });

  it('changes when the network passphrase changes', () => {
    const onTestnet = predictContractAddress(
      deployer.publicKey(),
      salt,
      Networks.TESTNET
    );
    const onPublic = predictContractAddress(
      deployer.publicKey(),
      salt,
      Networks.PUBLIC
    );

    expect(onTestnet).not.toBe(onPublic);
  });

  it('changes when the deployer changes', () => {
    const other = Keypair.random();
    const first = predictContractAddress(
      deployer.publicKey(),
      salt,
      Networks.TESTNET
    );
    const second = predictContractAddress(
      other.publicKey(),
      salt,
      Networks.TESTNET
    );

    expect(first).not.toBe(second);
  });

  it('accepts a string salt, hash-normalized to 32 bytes', () => {
    const address = predictContractAddress(
      deployer.publicKey(),
      'my-deterministic-salt',
      Networks.TESTNET
    );

    expect(StrKey.isValidContract(address)).toBe(true);
  });

  it('accepts an scvBytes salt of exactly 32 bytes', () => {
    const address = predictContractAddress(
      deployer.publicKey(),
      xdr.ScVal.scvBytes(salt),
      Networks.TESTNET
    );

    expect(address).toBe(
      predictContractAddress(deployer.publicKey(), salt, Networks.TESTNET)
    );
  });
});

describe('normalizeSalt', () => {
  it('rejects a Buffer that is not 32 bytes', () => {
    expect(() => normalizeSalt(Buffer.alloc(16))).toThrow(
      /must be exactly 32 bytes/
    );
  });

  it('rejects an scvBytes ScVal that is not 32 bytes', () => {
    expect(() => normalizeSalt(xdr.ScVal.scvBytes(Buffer.alloc(4)))).toThrow(
      /must be exactly 32 bytes/
    );
  });

  it('rejects a non-scvBytes ScVal', () => {
    expect(() => normalizeSalt(xdr.ScVal.scvVoid())).toThrow(
      /scvBytes/
    );
  });
});

describe('ContractFactory.getPredictedAddress', () => {
  const factory = new ContractFactory({
    wasm: Buffer.from([]),
    networkPassphrase: Networks.TESTNET,
  });
  const deployer = Keypair.random();
  const salt = Buffer.alloc(32, 3);

  it('matches predictContractAddress for the same inputs', () => {
    expect(factory.getPredictedAddress(deployer, salt)).toBe(
      predictContractAddress(deployer.publicKey(), salt, Networks.TESTNET)
    );
  });

  it('rejects an invalid salt length', () => {
    expect(() => factory.getPredictedAddress(deployer, Buffer.alloc(10))).toThrow(
      /must be exactly 32 bytes/
    );
  });
});
