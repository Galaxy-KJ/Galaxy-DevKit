import {
  SmartWalletService,
  ttlSecondsToLedgers,
} from '../smart-wallet.service';
import { Transaction, xdr } from '@stellar/stellar-sdk';
import { Api } from '@stellar/stellar-sdk/rpc';
import type { CredentialBackend } from '../types/smart-wallet.types';

// ---------------------------------------------------------------------------
// Shared assembled-tx mock (used by sign, addSigner)
// ---------------------------------------------------------------------------

const mockAssembledTx = {
  build: jest.fn().mockReturnValue({
    toEnvelope: jest.fn().mockReturnValue({
      toXDR: jest.fn(() => 'VALID_XDR_BASE64'),
    }),
  }),
};

jest.mock('@stellar/stellar-sdk/rpc', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk/rpc');
  return {
    ...actual,
    assembleTransaction: jest.fn(() => mockAssembledTx),
    Server: jest.fn().mockImplementation(() => ({
      simulateTransaction: jest.fn(),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
    })),
  };
});

jest.mock('../../auth/src/providers/WebAuthNProvider', () => {
  const actual = jest.requireActual(
    '../../auth/src/providers/WebAuthNProvider'
  );
  return {
    ...actual,
    convertSignatureDERtoCompact: jest.fn(() => new Uint8Array(64).fill(0xcd)),
  };
});

// ---------------------------------------------------------------------------
// Stellar SDK mocks — keep Contract + TransactionBuilder + StrKey accessible
// ---------------------------------------------------------------------------

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');

  const contractCallMock = jest
    .fn()
    .mockReturnValue({ type: 'invokeHostFunction' });
  const ContractMock = jest
    .fn()
    .mockImplementation(() => ({ call: contractCallMock }));

  const txBuilderInstance = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      type: 'transaction',
      toEnvelope: jest.fn().mockReturnValue({
        toXDR: jest.fn(() => 'TRUSTLINE_XDR_BASE64'),
      }),
    }),
  };
  const TransactionBuilderMock = jest
    .fn()
    .mockImplementation(() => txBuilderInstance);

  return {
    ...actual,
    Contract: ContractMock,
    TransactionBuilder: TransactionBuilderMock,
    nativeToScVal: jest.fn().mockReturnValue({ type: 'scvU32' }),
    Asset: jest.fn().mockImplementation((code: string, issuer: string) => ({
      code,
      issuer,
    })),
    Operation: {
      ...actual.Operation,
      changeTrust: jest
        .fn()
        .mockReturnValue({ type: 'changeTrust' }),
    },
    BASE_FEE: '100',
    StrKey: {
      ...actual.StrKey,
      decodeContract: jest.fn().mockReturnValue(new Uint8Array(32).fill(1)),
      decodeEd25519PublicKey: jest
        .fn()
        .mockReturnValue(new Uint8Array(32).fill(9)),
      encodeEd25519PublicKey: jest
        .fn()
        .mockReturnValue(
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
        ),
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CONTRACT_ADDRESS =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

// Valid Stellar G-address used as session public key
const MOCK_SESSION_PUBLIC_KEY =
  'GDXYZ1234567890ABCDEFGDXYZ1234567890ABCDEFGDXYZ1234567890AB';

const MOCK_CREDENTIAL_ID = Buffer.from('test-credential-id').toString('base64');
const TTL_SECONDS = 3600;

function makeAuthEntry() {
  const entry = {
    toXDR: jest.fn(() => Buffer.alloc(32, 0xab)),
    credentials: jest.fn(),
    rootInvocation: jest.fn().mockReturnValue({
      function: () => ({
        switch: () => ({
          value:
            xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeCreateContractHostFn()
              .value,
        }),
      }),
    }),
  } as unknown as xdr.SorobanAuthorizationEntry;

  (entry.credentials as jest.Mock).mockReturnValue({
    address: () => ({
      nonce: () => 0n,
      signatureExpirationLedger: () => 9999,
    }),
  });

  return entry;
}

function makeSimResult(authEntry: xdr.SorobanAuthorizationEntry) {
  return { result: { auth: [authEntry] } };
}

function makeAssertion(): PublicKeyCredential {
  return {
    id: MOCK_CREDENTIAL_ID,
    rawId: Uint8Array.from(Buffer.from(MOCK_CREDENTIAL_ID, 'base64')).buffer,
    type: 'public-key',
    response: {
      authenticatorData: new ArrayBuffer(37),
      clientDataJSON: new ArrayBuffer(100),
      signature: new ArrayBuffer(72),
    },
  } as unknown as PublicKeyCredential;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SmartWalletService', () => {
  let service: SmartWalletService;
  let mockServer: {
    simulateTransaction: jest.Mock;
    getLatestLedger: jest.Mock;
    getAccount: jest.Mock;
  };
  let mockCredentialBackend: jest.Mocked<CredentialBackend>;
  const sorobanTx = {} as unknown as Transaction;
  const publicKey = new Uint8Array(65).fill(0x04);

  beforeEach(() => {
    const { Server } = jest.requireMock('@stellar/stellar-sdk/rpc');
    mockServer = {
      simulateTransaction: jest.fn(),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
      getAccount: jest.fn().mockResolvedValue({
        accountId: () => 'GABC1234ACCOUNTID',
        sequenceNumber: () => '100',
        incrementSequenceNumber: () => {},
      }),
    };
    (Server as jest.Mock).mockImplementation(() => mockServer);

    mockCredentialBackend = {
      get: jest.fn().mockResolvedValue(makeAssertion()),
      create: jest.fn(),
    };
    service = new SmartWalletService(
      { relyingPartyId: 'localhost' },
      'https://rpc.example.com',
      undefined,
      undefined,
      mockCredentialBackend
    );

    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: {
          digest: jest
            .fn()
            .mockResolvedValue(new Uint8Array(32).fill(7).buffer),
        },
      },
      writable: true,
    });

    global.atob = (b64: string) =>
      Buffer.from(b64, 'base64').toString('binary');
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) =>
          key === 'webauthn_credentials'
            ? JSON.stringify([MOCK_CREDENTIAL_ID])
            : null
        ),
      },
      writable: true,
      configurable: true,
    });

    jest.spyOn(Api, 'isSimulationError').mockReturnValue(false);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // ttlSecondsToLedgers() — pure utility, no mocks needed
  // =========================================================================

  describe('ttlSecondsToLedgers()', () => {
    it('converts exact multiples correctly', () => {
      expect(ttlSecondsToLedgers(5)).toBe(1);
      expect(ttlSecondsToLedgers(3600)).toBe(720);
      expect(ttlSecondsToLedgers(86400)).toBe(17_280);
    });

    it('rounds UP for non-exact values', () => {
      expect(ttlSecondsToLedgers(6)).toBe(2); // 6/5 = 1.2 → 2
      expect(ttlSecondsToLedgers(1)).toBe(1); // 1/5 = 0.2 → 1
    });

    it('handles a 7-day session (604800s)', () => {
      expect(ttlSecondsToLedgers(604800)).toBe(120_960);
    });
  });

  // =========================================================================
  // sign()
  // =========================================================================

  describe('sign()', () => {
    function setupHappyPath() {
      const authEntry = makeAuthEntry();
      mockServer.simulateTransaction.mockResolvedValue(
        makeSimResult(authEntry)
      );
      return authEntry;
    }

    it('returns a non-empty XDR string', async () => {
      setupHappyPath();
      const result = await service.sign(
        MOCK_CONTRACT_ADDRESS,
        sorobanTx,
        'Y3JlZElk'
      );
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('calls simulateTransaction with the provided transaction', async () => {
      setupHappyPath();
      await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk');
      expect(mockServer.simulateTransaction).toHaveBeenCalledWith(sorobanTx);
    });

    it('throws if simulation returns an error', async () => {
      jest.spyOn(Api, 'isSimulationError').mockReturnValue(true);
      mockServer.simulateTransaction.mockResolvedValue({
        error: 'insufficient fee',
      });

      await expect(
        service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk')
      ).rejects.toThrow('Simulation failed');
    });

    it('throws if simulation returns no auth entries', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { auth: [] },
      });

      await expect(
        service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk')
      ).rejects.toThrow('no auth entries');
    });

    it('WebAuthn challenge is exactly 32 bytes (SHA-256 of auth entry)', async () => {
      setupHappyPath();
      await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk');

      const { challenge } =
        mockCredentialBackend.get.mock.calls[0][0].publicKey!;
      expect(challenge.byteLength).toBe(32);
    });

    it('includes the credentialId in allowCredentials', async () => {
      setupHappyPath();
      await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk');

      const { allowCredentials } =
        mockCredentialBackend.get.mock.calls[0][0].publicKey!;
      expect(allowCredentials[0].type).toBe('public-key');
      expect(allowCredentials[0].id.byteLength).toBeGreaterThan(0);
    });

    it('throws if WebAuthn returns null (user cancelled)', async () => {
      setupHappyPath();
      mockCredentialBackend.get.mockResolvedValue(null);

      await expect(
        service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk')
      ).rejects.toThrow('cancelled or timed out');
    });

    it('calls credentials() to attach the signed auth entry', async () => {
      const authEntry = setupHappyPath();
      await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk');

      expect(authEntry.credentials).toHaveBeenCalled();
    });

    it('uses rpId from the webAuthnProvider', async () => {
      setupHappyPath();
      await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk');

      const { rpId } = mockCredentialBackend.get.mock.calls[0][0].publicKey!;
      expect(rpId).toBe('localhost');
    });

    it('calls assembleTransaction after attaching the signature', async () => {
      setupHappyPath();
      const { assembleTransaction } = jest.requireMock(
        '@stellar/stellar-sdk/rpc'
      );
      await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, 'Y3JlZElk');

      expect(assembleTransaction).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // signWithSessionKey()
  // =========================================================================

  describe('signWithSessionKey()', () => {
    function setupHappyPath() {
      const authEntry = makeAuthEntry();
      mockServer.simulateTransaction.mockResolvedValue(
        makeSimResult(authEntry)
      );
      return authEntry;
    }

    it('returns a non-empty XDR string', async () => {
      setupHappyPath();

      const result = await service.signWithSessionKey(
        MOCK_CONTRACT_ADDRESS,
        sorobanTx,
        MOCK_CREDENTIAL_ID,
        () => Buffer.alloc(64, 0xaa)
      );

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('calls simulateTransaction with the provided transaction', async () => {
      setupHappyPath();

      await service.signWithSessionKey(
        MOCK_CONTRACT_ADDRESS,
        sorobanTx,
        MOCK_CREDENTIAL_ID,
        () => Buffer.alloc(64, 0xaa)
      );

      expect(mockServer.simulateTransaction).toHaveBeenCalledWith(sorobanTx);
    });

    it('passes the 32-byte auth entry hash into signFn', async () => {
      setupHappyPath();
      const signFn = jest.fn(() => Buffer.alloc(64, 0xaa));

      await service.signWithSessionKey(
        MOCK_CONTRACT_ADDRESS,
        sorobanTx,
        MOCK_CREDENTIAL_ID,
        signFn
      );

      expect(signFn).toHaveBeenCalledTimes(1);
      expect(Buffer.isBuffer(signFn.mock.calls[0][0])).toBe(true);
      expect(signFn.mock.calls[0][0]).toHaveLength(32);
    });

    it('attaches the signed auth entry and assembles the transaction', async () => {
      const authEntry = setupHappyPath();
      const { assembleTransaction } = jest.requireMock(
        '@stellar/stellar-sdk/rpc'
      );

      await service.signWithSessionKey(
        MOCK_CONTRACT_ADDRESS,
        sorobanTx,
        MOCK_CREDENTIAL_ID,
        () => Buffer.alloc(64, 0xaa)
      );

      expect(authEntry.credentials).toHaveBeenCalled();
      expect(assembleTransaction).toHaveBeenCalled();
    });

    it('throws if contractAddress is missing', async () => {
      await expect(
        service.signWithSessionKey('', sorobanTx, MOCK_CREDENTIAL_ID, () =>
          Buffer.alloc(64, 0xaa)
        )
      ).rejects.toThrow('contractAddress is required');
    });

    it('throws if credentialId is missing', async () => {
      await expect(
        service.signWithSessionKey(MOCK_CONTRACT_ADDRESS, sorobanTx, '', () =>
          Buffer.alloc(64, 0xaa)
        )
      ).rejects.toThrow('credentialId is required');
    });

    it('throws if simulation returns an error', async () => {
      jest.spyOn(Api, 'isSimulationError').mockReturnValue(true);
      mockServer.simulateTransaction.mockResolvedValue({
        error: 'contract trap',
      });

      await expect(
        service.signWithSessionKey(
          MOCK_CONTRACT_ADDRESS,
          sorobanTx,
          MOCK_CREDENTIAL_ID,
          () => Buffer.alloc(64, 0xaa)
        )
      ).rejects.toThrow('signWithSessionKey simulation failed');
    });

    it('throws if simulation returns no auth entries', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { auth: [] },
      });

      await expect(
        service.signWithSessionKey(
          MOCK_CONTRACT_ADDRESS,
          sorobanTx,
          MOCK_CREDENTIAL_ID,
          () => Buffer.alloc(64, 0xaa)
        )
      ).rejects.toThrow(
        'signWithSessionKey simulation returned no auth entries'
      );
    });

    it('throws if signFn returns a signature with the wrong length', async () => {
      setupHappyPath();

      await expect(
        service.signWithSessionKey(
          MOCK_CONTRACT_ADDRESS,
          sorobanTx,
          MOCK_CREDENTIAL_ID,
          () => Buffer.alloc(63, 0xaa)
        )
      ).rejects.toThrow('signFn must return a 64-byte Ed25519 signature');
    });

    it('encodes the session key signature payload into Soroban auth credentials', async () => {
      const authEntry = setupHappyPath();

      await service.signWithSessionKey(
        MOCK_CONTRACT_ADDRESS,
        sorobanTx,
        MOCK_CREDENTIAL_ID,
        () => Buffer.alloc(64, 0xbb)
      );

      const credentialCalls = (authEntry.credentials as jest.Mock).mock.calls;
      const credentialsArg = credentialCalls[credentialCalls.length - 1][0];
      expect(credentialsArg).toBeDefined();
    });
  });

  // =========================================================================
  // addSigner()
  // =========================================================================

  describe('addSigner()', () => {
    function setupHappyPath() {
      const authEntry = makeAuthEntry();
      mockServer.simulateTransaction.mockResolvedValue(
        makeSimResult(authEntry)
      );
      return authEntry;
    }

    const baseParams = () => ({
      walletAddress: MOCK_CONTRACT_ADDRESS,
      sessionPublicKey: MOCK_SESSION_PUBLIC_KEY,
      ttlSeconds: TTL_SECONDS,
      credentialId: MOCK_CREDENTIAL_ID,
    });

    // ── Happy path ────────────────────────────────────────────────────────────

    it('returns a non-empty XDR string', async () => {
      setupHappyPath();
      const result = await service.addSigner(baseParams());
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('calls simulateTransaction once', async () => {
      setupHappyPath();
      await service.addSigner(baseParams());
      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it('calls getLatestLedger to obtain a valid sequence', async () => {
      setupHappyPath();
      await service.addSigner(baseParams());
      expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1);
    });

    it('invokes add_session_signer on the contract', async () => {
      setupHappyPath();
      const { Contract } = jest.requireMock('@stellar/stellar-sdk');
      const instance = new Contract();

      await service.addSigner(baseParams());

      expect(instance.call).toHaveBeenCalledWith(
        'add_session_signer',
        expect.anything(), // credential_id bytes
        expect.anything(), // session_public_key bytes
        expect.anything() // ttl_ledgers u32
      );
    });

    it('converts TTL seconds to ledgers correctly (3600s → 720 ledgers)', async () => {
      setupHappyPath();
      const { nativeToScVal } = jest.requireMock('@stellar/stellar-sdk');

      await service.addSigner(baseParams());

      expect(nativeToScVal).toHaveBeenCalledWith(720, { type: 'u32' });
    });

    it('decodes the session G-address to raw Ed25519 bytes', async () => {
      setupHappyPath();
      const { StrKey } = jest.requireMock('@stellar/stellar-sdk');

      await service.addSigner(baseParams());

      expect(StrKey.decodeEd25519PublicKey).toHaveBeenCalledWith(
        MOCK_SESSION_PUBLIC_KEY
      );
    });

    it('attaches the auth entry signature and assembles the tx', async () => {
      const authEntry = setupHappyPath();
      const { assembleTransaction } = jest.requireMock(
        '@stellar/stellar-sdk/rpc'
      );

      await service.addSigner(baseParams());

      expect(authEntry.credentials).toHaveBeenCalled();
      expect(assembleTransaction).toHaveBeenCalled();
    });

    // ── Pre-obtained assertion path (SessionKeyManager integration) ───────────

    it('skips credential backend lookup when webAuthnAssertion is provided', async () => {
      setupHappyPath();
      const assertion = makeAssertion();

      await service.addSigner({
        walletAddress: MOCK_CONTRACT_ADDRESS,
        sessionPublicKey: MOCK_SESSION_PUBLIC_KEY,
        ttlSeconds: TTL_SECONDS,
        webAuthnAssertion: assertion,
      });

      expect(mockCredentialBackend.get).not.toHaveBeenCalled();
    });

    it("uses the pre-obtained assertion's response directly", async () => {
      const authEntry = setupHappyPath();
      const assertion = makeAssertion();

      await service.addSigner({
        walletAddress: MOCK_CONTRACT_ADDRESS,
        sessionPublicKey: MOCK_SESSION_PUBLIC_KEY,
        ttlSeconds: TTL_SECONDS,
        webAuthnAssertion: assertion,
      });

      // Auth entry must still be mutated with credentials
      expect(authEntry.credentials).toHaveBeenCalled();
    });

    it('calls the credential backend when only credentialId is provided', async () => {
      setupHappyPath();
      await service.addSigner(baseParams());
      expect(mockCredentialBackend.get).toHaveBeenCalledTimes(1);
    });

    it('passes rpId from webAuthnProvider to the credentials.get() call', async () => {
      setupHappyPath();
      await service.addSigner(baseParams());

      const { rpId } = mockCredentialBackend.get.mock.calls[0][0].publicKey!;
      expect(rpId).toBe('localhost');
    });

    it('throws if WebAuthn returns null (user cancelled)', async () => {
      setupHappyPath();
      mockCredentialBackend.get.mockResolvedValue(null);

      await expect(service.addSigner(baseParams())).rejects.toThrow(
        'cancelled or timed out'
      );
    });

    // ── Input validation ──────────────────────────────────────────────────────

    it('throws if walletAddress is empty', async () => {
      await expect(
        service.addSigner({ ...baseParams(), walletAddress: '' })
      ).rejects.toThrow('walletAddress is required');
    });

    it('throws if sessionPublicKey is empty', async () => {
      await expect(
        service.addSigner({ ...baseParams(), sessionPublicKey: '' })
      ).rejects.toThrow('sessionPublicKey is required');
    });

    it('throws if ttlSeconds is zero', async () => {
      await expect(
        service.addSigner({ ...baseParams(), ttlSeconds: 0 })
      ).rejects.toThrow('ttlSeconds must be positive');
    });

    it('throws if ttlSeconds is negative', async () => {
      await expect(
        service.addSigner({ ...baseParams(), ttlSeconds: -60 })
      ).rejects.toThrow('ttlSeconds must be positive');
    });

    it('throws if neither credentialId nor webAuthnAssertion is provided', async () => {
      const { credentialId: _, ...noCredential } = baseParams();

      await expect(service.addSigner(noCredential)).rejects.toThrow(
        'either webAuthnAssertion or credentialId must be provided'
      );
    });

    // ── Simulation errors ─────────────────────────────────────────────────────

    it('throws if simulation returns an error', async () => {
      jest.spyOn(Api, 'isSimulationError').mockReturnValue(true);
      mockServer.simulateTransaction.mockResolvedValue({
        error: 'contract trap',
      });

      await expect(service.addSigner(baseParams())).rejects.toThrow(
        'addSigner simulation failed'
      );
    });

    it('throws if simulation returns no auth entries', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { auth: [] },
      });

      await expect(service.addSigner(baseParams())).rejects.toThrow(
        'addSigner simulation returned no auth entries'
      );
    });

    // ── TTL edge cases ────────────────────────────────────────────────────────

    it('rounds up a non-exact TTL (6s → 2 ledgers)', async () => {
      setupHappyPath();
      const { nativeToScVal } = jest.requireMock('@stellar/stellar-sdk');

      await service.addSigner({ ...baseParams(), ttlSeconds: 6 });

      expect(nativeToScVal).toHaveBeenCalledWith(2, { type: 'u32' });
    });

    it('handles a 7-day TTL (604800s → 120960 ledgers)', async () => {
      setupHappyPath();
      const { nativeToScVal } = jest.requireMock('@stellar/stellar-sdk');

      await service.addSigner({ ...baseParams(), ttlSeconds: 604800 });

      expect(nativeToScVal).toHaveBeenCalledWith(120_960, { type: 'u32' });
    });
  });

  // =========================================================================
  // removeSigner()
  // =========================================================================

  describe('removeSigner()', () => {
    function setupHappyPath() {
      const authEntry = makeAuthEntry();
      mockServer.simulateTransaction.mockResolvedValue(
        makeSimResult(authEntry)
      );
      return authEntry;
    }

    const baseParams = () => ({
      walletAddress: MOCK_CONTRACT_ADDRESS,
      signerPublicKey: MOCK_SESSION_PUBLIC_KEY,
      credentialId: MOCK_CREDENTIAL_ID,
    });

    it('returns a non-empty XDR string', async () => {
      setupHappyPath();
      const result = await service.removeSigner(baseParams());
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('invokes remove_signer on the contract', async () => {
      setupHappyPath();
      const { Contract } = jest.requireMock('@stellar/stellar-sdk');
      const instance = new Contract();

      await service.removeSigner(baseParams());

      expect(instance.call).toHaveBeenCalledWith(
        'remove_signer',
        expect.anything()
      );
    });

    it('skips credential backend lookup when webAuthnAssertion is provided', async () => {
      setupHappyPath();

      await service.removeSigner({
        walletAddress: MOCK_CONTRACT_ADDRESS,
        signerPublicKey: MOCK_SESSION_PUBLIC_KEY,
        webAuthnAssertion: makeAssertion(),
      });

      expect(mockCredentialBackend.get).not.toHaveBeenCalled();
    });

    it('throws if simulation returns an error', async () => {
      jest.spyOn(Api, 'isSimulationError').mockReturnValue(true);
      mockServer.simulateTransaction.mockResolvedValue({
        error: 'contract trap',
      });

      await expect(service.removeSigner(baseParams())).rejects.toThrow(
        'removeSigner simulation failed'
      );
    });

    it('throws if simulation returns no auth entries', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { auth: [] },
      });

      await expect(service.removeSigner(baseParams())).rejects.toThrow(
        'removeSigner simulation returned no auth entries'
      );
    });
  });

  // =========================================================================
  // deploy()
  // =========================================================================

  describe('deploy()', () => {
    it('returns the contract address from the simulation result', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: {
          retval: {
            address: () => ({
              contractId: () => ({ toString: () => MOCK_CONTRACT_ADDRESS }),
            }),
          },
        },
      });

      const result = await service.deploy(publicKey, MOCK_CONTRACT_ADDRESS);
      expect(result).toBe(MOCK_CONTRACT_ADDRESS);
      expect(result.length).toBeGreaterThan(0);
    });

    it('throws if deploy simulation returns an error', async () => {
      jest.spyOn(Api, 'isSimulationError').mockReturnValue(true);
      mockServer.simulateTransaction.mockResolvedValue({
        error: 'contract error',
      });

      await expect(
        service.deploy(publicKey, MOCK_CONTRACT_ADDRESS)
      ).rejects.toThrow('Deploy simulation failed');
    });

    it('throws if factory returns no contract address', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { retval: null },
      });

      await expect(
        service.deploy(publicKey, MOCK_CONTRACT_ADDRESS)
      ).rejects.toThrow('Factory did not return a contract address');
    });

    it('builds the factory deploy invocation internally', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: {
          retval: {
            address: () => ({
              contractId: () => ({ toString: () => MOCK_CONTRACT_ADDRESS }),
            }),
          },
        },
      });
      const { Contract } = jest.requireMock('@stellar/stellar-sdk');
      const instance = new Contract();

      await service.deploy(publicKey, MOCK_CONTRACT_ADDRESS);

      expect(instance.call).toHaveBeenCalledWith(
        'deploy',
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
      expect(mockServer.simulateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'transaction' })
      );
    });

    it('throws if no stored credential ID exists', async () => {
      (global.localStorage.getItem as jest.Mock).mockReturnValueOnce(null);

      await expect(
        service.deploy(publicKey, MOCK_CONTRACT_ADDRESS)
      ).rejects.toThrow('no stored WebAuthn credential ID');
    });

    it('throws if the public key is not 65 bytes', async () => {
      await expect(
        service.deploy(new Uint8Array(64), MOCK_CONTRACT_ADDRESS)
      ).rejects.toThrow('must be 65 bytes');
    });
  });

  // =========================================================================
  // setupUSDCTrustline()
  // =========================================================================

  describe('setupUSDCTrustline()', () => {
    const ACCOUNT_ID =
      'GABC1EFGHIJKLMNOPQRSTUVWXYZABC1EFGHIJKLMNOPQRSTUVWXYZABC1EF';

    it('returns XDR for a testnet USDC trustline', async () => {
      const result = await service.setupUSDCTrustline(ACCOUNT_ID, 'testnet');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns XDR for a mainnet USDC trustline', async () => {
      const result = await service.setupUSDCTrustline(ACCOUNT_ID, 'mainnet');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('calls server.getAccount with the given accountId', async () => {
      await service.setupUSDCTrustline(ACCOUNT_ID, 'testnet');
      expect(mockServer.getAccount).toHaveBeenCalledWith(ACCOUNT_ID);
    });

    it('creates USDC asset with the testnet issuer', async () => {
      await service.setupUSDCTrustline(ACCOUNT_ID, 'testnet');
      const { Asset } = jest.requireMock('@stellar/stellar-sdk');
      expect(Asset).toHaveBeenCalledWith(
        'USDC',
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
      );
    });

    it('creates USDC asset with the mainnet issuer', async () => {
      await service.setupUSDCTrustline(ACCOUNT_ID, 'mainnet');
      const { Asset } = jest.requireMock('@stellar/stellar-sdk');
      expect(Asset).toHaveBeenCalledWith(
        'USDC',
        'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
      );
    });

    it('builds a ChangeTrust operation', async () => {
      await service.setupUSDCTrustline(ACCOUNT_ID, 'testnet');
      const { Operation } = jest.requireMock('@stellar/stellar-sdk');
      expect(Operation.changeTrust).toHaveBeenCalledWith(
        expect.objectContaining({ asset: expect.anything() })
      );
    });

    it('throws if accountId is empty', async () => {
      await expect(
        service.setupUSDCTrustline('', 'testnet')
      ).rejects.toThrow('setupUSDCTrustline: accountId is required');
    });

    it('throws if network is invalid', async () => {
      await expect(
        // @ts-expect-error — intentionally passing invalid value
        service.setupUSDCTrustline(ACCOUNT_ID, 'devnet')
      ).rejects.toThrow("setupUSDCTrustline: network must be 'testnet' or 'mainnet'");
    });

    it('throws if server.getAccount rejects', async () => {
      mockServer.getAccount.mockRejectedValueOnce(new Error('account not found'));
      await expect(
        service.setupUSDCTrustline(ACCOUNT_ID, 'testnet')
      ).rejects.toThrow('account not found');
    });
  });

  // =========================================================================
  // deploy() with autoTrustlineUSDC
  // =========================================================================

  describe('deploy() with autoTrustlineUSDC', () => {
    const ACCOUNT_ID =
      'GABC1EFGHIJKLMNOPQRSTUVWXYZABC1EFGHIJKLMNOPQRSTUVWXYZABC1EF';

    beforeEach(() => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: {
          retval: {
            address: () => ({
              contractId: () => ({ toString: () => MOCK_CONTRACT_ADDRESS }),
            }),
          },
        },
      });
    });

    it('returns contractAddress and trustlineXdr when autoTrustlineUSDC is true', async () => {
      const result = await service.deploy(
        publicKey,
        MOCK_CONTRACT_ADDRESS,
        undefined,
        { autoTrustlineUSDC: true, usdcNetwork: 'testnet', accountId: ACCOUNT_ID }
      );

      expect(result).toEqual(
        expect.objectContaining({
          contractAddress: MOCK_CONTRACT_ADDRESS,
          trustlineXdr: expect.any(String),
        })
      );
    });

    it('calls setupUSDCTrustline with the correct accountId and network', async () => {
      const spy = jest.spyOn(service, 'setupUSDCTrustline');

      await service.deploy(
        publicKey,
        MOCK_CONTRACT_ADDRESS,
        undefined,
        { autoTrustlineUSDC: true, usdcNetwork: 'mainnet', accountId: ACCOUNT_ID }
      );

      expect(spy).toHaveBeenCalledWith(ACCOUNT_ID, 'mainnet');
    });

    it('returns a plain string (contract address) when no options are passed', async () => {
      const result = await service.deploy(publicKey, MOCK_CONTRACT_ADDRESS);
      expect(result).toBe(MOCK_CONTRACT_ADDRESS);
    });
  });
});
