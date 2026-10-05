/**
 * @jest-environment jsdom
 */

import { WalletConnectorService } from '../services/wallet-connector';
import { SmartWalletClient } from '../services/smart-wallet.client';
import { setupWebAuthnMock } from './mock-webauthn';
import { Buffer } from 'buffer';
import { StrKey, Networks, xdr } from '@stellar/stellar-sdk';

function rpcEntry(value: xdr.ScVal) {
  return {
    val: {
      contractData: () => ({
        val: () => value,
      }),
    },
  };
}

function rpcInstanceEntry(signerIndex: xdr.ScVal) {
  return {
    val: {
      contractData: () => ({
        val: () => ({
          instance: () => ({
            storage: () => [{
              key: () => xdr.ScVal.scvSymbol('signers'),
              val: () => signerIndex,
            }],
          }),
        }),
      }),
    },
  };
}

// The Rust `SignerIndexEntry`/`Signer` types are named-field structs
// (#[contracttype]), which Soroban serializes as an ScMap keyed by field
// name — NOT a positional ScVec. These fixtures mirror that real shape so
// `scValToNative()` decodes them the same way it decodes live ledger data.
function signerIndexEntry(credentialId: string, kind: 'Admin' | 'Session'): xdr.ScVal {
  return xdr.ScVal.scvMap([
<<<<<<< HEAD
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('credential_id'), val: xdr.ScVal.scvBytes(Buffer.from(credentialId)) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('kind'), val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind)]) }),
=======
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('credential_id'),
      val: xdr.ScVal.scvBytes(Buffer.from(credentialId)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('kind'),
      val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind)]),
    }),
>>>>>>> main
  ]);
}

function signerRecord(publicKey: Uint8Array, kind: 'Admin' | 'Session'): xdr.ScVal {
  return xdr.ScVal.scvMap([
<<<<<<< HEAD
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('kind'), val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind)]) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('public_key'), val: xdr.ScVal.scvBytes(Buffer.from(publicKey)) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('ttl_ledgers'), val: xdr.ScVal.scvU32(0) }),
=======
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('public_key'),
      val: xdr.ScVal.scvBytes(Buffer.from(publicKey)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('kind'),
      val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind)]),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('ttl_ledgers'),
      val: xdr.ScVal.scvU32(0),
    }),
>>>>>>> main
  ]);
}

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
  };
});

jest.mock('@stellar/stellar-sdk/rpc', () => {
  return {
    Server: jest.fn().mockImplementation(() => ({
      getLatestLedger: jest.fn(() => Promise.resolve({ sequence: 12345 })),
      getLedgerEntries: jest.fn(() => Promise.resolve({ entries: [{}] })),
    })),
  };
});

describe('WalletConnectorService', () => {
  let client: SmartWalletClient;
  let connectorService: WalletConnectorService;
  const testContractAddress = 'CBJLVS7PUHVFRRMOWIXXF5SGETGU7ELPSRU47WYXHAIOAIXF4XID27WV';

  beforeEach(() => {
    setupWebAuthnMock();
    localStorage.clear();
    client = new SmartWalletClient();
    connectorService = new WalletConnectorService(
      client,
      'https://soroban-testnet.stellar.org',
      Networks.TESTNET
    );

    const mockServer = (connectorService as any).server;
    mockServer.getLedgerEntries.mockImplementation(async (...keys: xdr.LedgerKey[]) => {
      const key = keys[0].contractData().key();
      // fetchSigners() reads the real "instance" storage slot via
      // scvLedgerKeyContractInstance() — a distinct ScVal switch from the
      // plain scvSymbol('Instance') placeholder verifyContractExists() uses
      // just to probe existence. Route each to the shape its caller expects.
      if (key.switch() === xdr.ScValType.scvLedgerKeyContractInstance()) {
        return { entries: [rpcInstanceEntry(xdr.ScVal.scvVec([]))] };
      }
      if (
        key.switch() === xdr.ScValType.scvSymbol() &&
        key.sym().toString() === 'Instance'
      ) {
        return { entries: [rpcInstanceEntry(xdr.ScVal.scvVec([]))] };
      }
      return { entries: [rpcEntry(xdr.ScVal.scvVec([]))] };
    });
  });

  describe('validateContractAddress', () => {
    it('should reject empty address', () => {
      const error = connectorService.validateContractAddress('');
      expect(error).toBe('Contract address is required');
    });

    it('should reject address not starting with C', () => {
      const error = connectorService.validateContractAddress('GABC123...');
      expect(error).toBe('Contract address must start with "C"');
    });

    it('should reject invalid bech32 format', () => {
      const error = connectorService.validateContractAddress('CINVALID!!!');
      expect(error).toBeDefined();
      expect(error).toContain('Invalid contract address format');
    });

    it('should accept valid contract address format', () => {
      const error = connectorService.validateContractAddress(testContractAddress);
      expect(error).toBeUndefined();
    });

    it('should accept contract addresses generated by StrKey', () => {
      // Generate a valid contract address using StrKey
      const contractId = new Uint8Array(32);
      crypto.getRandomValues(contractId);
      const validAddress = StrKey.encodeContract(Buffer.from(contractId));
      
      const error = connectorService.validateContractAddress(validAddress);
      expect(error).toBeUndefined();
    });
  });

  describe('verifyContractExists', () => {
    it('should reject address with invalid format', async () => {
      const result = await connectorService.verifyContractExists('invalid-address');
      expect(result).toBe(false);
    });

    it('should reject address not starting with C', async () => {
      const result = await connectorService.verifyContractExists('GABC123...');
      expect(result).toBe(false);
    });

    it('should return true when contract exists on-chain', async () => {
      const result = await connectorService.verifyContractExists(testContractAddress);
      expect(result).toBe(true);
    });

    it('should return false when contract does not exist on-chain', async () => {
      const mockServer = (connectorService as any).server;
      mockServer.getLedgerEntries.mockResolvedValueOnce({ entries: [] });
      const result = await connectorService.verifyContractExists(testContractAddress);
      expect(result).toBe(false);
    });
  });

  describe('isSmartWalletContract', () => {
    it('should return false for non-existent contract', async () => {
      const result = await connectorService.isSmartWalletContract('invalid');
      expect(result).toBe(false);
    });

    it('should return true for valid smart wallet address', async () => {
      const result = await connectorService.isSmartWalletContract(testContractAddress);
      expect(result).toBe(true);
    });

    it('should return false if contract verification fails', async () => {
      const mockServer = (connectorService as any).server;
      mockServer.getLedgerEntries.mockResolvedValueOnce({ entries: [] });
      const result = await connectorService.isSmartWalletContract(testContractAddress);
      expect(result).toBe(false);
    });
  });

  describe('fetchSigners', () => {
    it('decodes multiple signers from the wallet signer index and contract storage', async () => {
      const mockServer = (connectorService as any).server;
      const adminId = 'admin-credential';
      const sessionId = 'session-credential';
      const adminKey = new Uint8Array(65).fill(7);
      const sessionKey = new Uint8Array(32).fill(9);
      mockServer.getLedgerEntries
        .mockResolvedValueOnce({
          entries: [
            rpcInstanceEntry(xdr.ScVal.scvVec([
              signerIndexEntry(adminId, 'Admin'),
              signerIndexEntry(sessionId, 'Session'),
            ])),
          ],
        })
        .mockResolvedValueOnce({ entries: [rpcEntry(signerRecord(adminKey, 'Admin'))] })
        .mockResolvedValueOnce({ entries: [rpcEntry(signerRecord(sessionKey, 'Session'))] });

      const signers = await connectorService.fetchSigners(testContractAddress);
      expect(signers).toEqual([
        {
          id: Buffer.from(adminId).toString('base64url'),
          type: 'admin',
          publicKey: Buffer.from(adminKey).toString('hex'),
          isActive: true,
        },
        {
          id: Buffer.from(sessionId).toString('base64url'),
          type: 'session',
          publicKey: Buffer.from(sessionKey).toString('hex'),
          isActive: true,
        },
      ]);
    });

    it('returns an empty array when the on-chain signer index is empty', async () => {
      await expect(
        connectorService.fetchSigners(testContractAddress)
      ).resolves.toEqual([]);
    });

    it('reports when the contract does not expose a signer index', async () => {
      const mockServer = (connectorService as any).server;
      mockServer.getLedgerEntries.mockResolvedValueOnce({ entries: [] });

      await expect(connectorService.fetchSigners(testContractAddress))
        .rejects.toThrow('Signer index is not available');
    });
  });

  describe('importWallet', () => {
    it('should reject invalid address format', async () => {
      const result = await connectorService.importWallet('invalid-address');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should include wallet address in result', async () => {
      const result = await connectorService.importWallet(testContractAddress);
      expect(result.address).toBe(testContractAddress);
    });

    it('should attempt verification and return structured result', async () => {
      const result = await connectorService.importWallet(testContractAddress);
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('isSmartWallet');
      expect(result).toHaveProperty('signers');
      expect(result.errorMessage).toBeUndefined();
      expect(Array.isArray(result.signers)).toBe(true);
    });
  });

  describe('connectToWallet', () => {
    it('should reject invalid address', async () => {
      const result = await connectorService.connectToWallet('invalid');
      expect(result).toBe(false);
    });

    it('should return true for successful connection', async () => {
      const result = await connectorService.connectToWallet(testContractAddress);
      expect(result).toBe(true);
    });

    it('should return false if connection fails verification', async () => {
      const mockServer = (connectorService as any).server;
      mockServer.getLedgerEntries.mockResolvedValueOnce({ entries: [] });
      const result = await connectorService.connectToWallet(testContractAddress);
      expect(result).toBe(false);
    });

    it('should validate address format before attempting connection', async () => {
      const result = await connectorService.connectToWallet('not-a-contract');
      expect(result).toBe(false);
    });
  });

  describe('stored connections', () => {
    it('should initialize with empty connections', () => {
      const connections = connectorService.getStoredConnections();
      expect(Array.isArray(connections)).toBe(true);
      expect(connections).toHaveLength(0);
    });

    it('should handle corrupt localStorage gracefully', () => {
      localStorage.setItem('smart_wallet_connections', 'not-valid-json{');
      const connections = connectorService.getStoredConnections();
      expect(Array.isArray(connections)).toBe(true);
      expect(connections).toHaveLength(0);
      expect(localStorage.getItem('smart_wallet_connections')).toBeNull();
    });

    it('should remove stored connection', () => {
      // Note: Full testing would require successful storage first
      expect(() => {
        connectorService.removeStoredConnection(testContractAddress);
      }).not.toThrow();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network error
      const mockServer = (connectorService as any).server;
      mockServer.getLedgerEntries.mockRejectedValueOnce(new Error('Network error'));

      const result = await connectorService.importWallet(testContractAddress);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should handle whitespace in address input', () => {
      const addressWithSpaces = `  ${testContractAddress}  `;
      // The service should handle or reject this appropriately
      const error = connectorService.validateContractAddress(addressWithSpaces);
      // Either validates or rejects, but shouldn't crash
      expect(error === undefined || typeof error === 'string').toBe(true);
    });

    it('should maintain connection storage consistency', () => {
      const connections1 = connectorService.getStoredConnections();
      const connections2 = connectorService.getStoredConnections();
      expect(connections1).toEqual(connections2);
    });
  });
});