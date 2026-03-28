import { SoroswapProtocol } from "../../../defi-protocols/src/protocols/soroswap/soroswap-protocol";
import { SmartWalletService } from "../smart-wallet.service";
import { WebAuthNProvider } from "../../auth/src/providers/WebAuthNProvider";
import { Transaction, Networks, BASE_FEE, rpc, Address, xdr } from "@stellar/stellar-sdk";
import { Asset } from "../../../defi-protocols/src/types/defi-types";

// =============================================================================
// Mocks
// =============================================================================

jest.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: jest.fn().mockImplementation(() => ({
    simulateTransaction: jest.fn(),
    prepareTransaction: jest.fn().mockImplementation((tx) => ({
      toXDR: () => "MOCK_PREPARED_XDR",
      build: () => tx,
    })),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
  })),
  assembleTransaction: jest.fn().mockImplementation((tx, sim) => ({
    build: () => ({
      toEnvelope: () => ({
        toXDR: () => "MOCK_SIGNED_XDR_BASE64",
      }),
    }),
  })),
  Api: {
    isSimulationError: jest.fn().mockReturnValue(false),
  },
}));

jest.mock("../../auth/src/providers/WebAuthNProvider", () => ({
  WebAuthNProvider: jest.fn(),
  convertSignatureDERtoCompact: jest.fn(() => new Uint8Array(64).fill(0xcd)),
}));

// =============================================================================
// Integration Test
// =============================================================================

describe("Soroswap + Smart Wallet Integration", () => {
  let soroswap: SoroswapProtocol;
  let smartWallet: SmartWalletService;
  
  const SMART_WALLET_ADDRESS = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  const SOROSWAP_ROUTER = "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD";
  const CREDENTIAL_ID = "test-credential-id";

  const tokenA: Asset = { code: "XLM", type: "native" };
  const tokenB: Asset = { 
    code: "USDC", 
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", 
    type: "credit_alphanum4" 
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const mockProvider = { rpId: "localhost" } as unknown as WebAuthNProvider;
    smartWallet = new SmartWalletService(mockProvider, "https://rpc.testnet.stellar.org");

    soroswap = new SoroswapProtocol({
      protocolId: "soroswap",
      name: "Soroswap",
      network: {
        network: "testnet",
        horizonUrl: "https://horizon-testnet.stellar.org",
        sorobanRpcUrl: "https://soroban-testnet.stellar.org",
        passphrase: Networks.TESTNET,
      },
      contractAddresses: {
        router: SOROSWAP_ROUTER,
        factory: "CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY",
      },
      metadata: {},
    });

    // Mock Horizon Server in Protocol
    (soroswap as any).horizonServer = {
      loadAccount: jest.fn().mockRejectedValue(new Error("Account not found (Contract)")),
      ledgers: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({}),
        }),
      }),
    };

    // Global Browser APIs Mocks
    Object.defineProperty(global, "navigator", {
      value: {
        credentials: {
          get: jest.fn().mockResolvedValue({
            response: {
              authenticatorData: new ArrayBuffer(37),
              clientDataJSON: new ArrayBuffer(100),
              signature: new ArrayBuffer(72),
            },
          }),
        },
      },
      writable: true,
    });

    Object.defineProperty(global, "crypto", {
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(new Uint8Array(32).fill(0xaa).buffer),
        },
      },
      writable: true,
    });
    
    global.atob = (b64: string) => Buffer.from(b64, "base64").toString("binary");
  });

  it("should successfully generate and sign a Soroswap swap via Smart Wallet", async () => {
    // 1. Initialize Protocol
    await soroswap.initialize();

    // 2. Mock Simulation for Swap
    const mockAuthEntry = {
      toXDR: jest.fn().mockReturnValue(Buffer.alloc(32, 0x11)),
      credentials: jest.fn().mockReturnThis(),
      address: jest.fn().mockReturnValue({
          nonce: () => 0n,
          signatureExpirationLedger: () => 1000,
      }),
      rootInvocation: jest.fn().mockReturnValue({
        function: () => ({
          switch: () => (xdr.SorobanAuthorizedFunctionType as any).sorobanAuthorizedFunctionTypeContractFn(),
          contractFn: () => ({
            contractAddress: () => Buffer.from(new Uint8Array(32).fill(0)),
            functionName: () => ({ toString: () => "swap_exact_tokens_for_tokens" }),
            args: () => [
                { type: 'i128' }, // amount_in
                { type: 'i128' }, // amount_out_min
                { type: 'vec' },  // path
                { type: 'address' }, // to (walletAddress)
            ],
          }),
        }),
      }),
    };

    jest.spyOn(Address, "fromScVal").mockImplementation((scval: any) => {
        if (scval && scval.type === 'address') {
            return new Address(SMART_WALLET_ADDRESS);
        }
        return new Address(SOROSWAP_ROUTER);
    });

    const mockSimResult = {
      result: {
        auth: [mockAuthEntry],
      },
    };

    const mockSorobanServer = (smartWallet as any).server;
    (mockSorobanServer.simulateTransaction as jest.Mock).mockResolvedValue(mockSimResult);

    // 3. Generate Swap XDR (Unsigned)
    const txResult = await soroswap.swap(
      SMART_WALLET_ADDRESS,
      "", // No private key
      tokenA,
      tokenB,
      "100",
      "95"
    );

    expect(txResult.status).toBe("pending");
    expect(txResult.hash).toBe("MOCK_PREPARED_XDR");

    // 4. Sign with Smart Wallet
    const dummyTx = { toXDR: () => "mock" } as Transaction;
    const signedXdr = await smartWallet.sign(SMART_WALLET_ADDRESS, dummyTx, CREDENTIAL_ID);

    expect(signedXdr).toBe("MOCK_SIGNED_XDR_BASE64");
    expect(global.navigator.credentials.get).toHaveBeenCalled();
  });

  it("should reject swap if 'to' address does not match wallet address (Protection)", async () => {
    // Mock a malicious swap simulation
    const mockAuthEntry = {
      toXDR: jest.fn().mockReturnValue(Buffer.alloc(32, 0x11)),
      credentials: jest.fn().mockReturnThis(),
      address: jest.fn().mockReturnValue({
          nonce: () => 0n,
          signatureExpirationLedger: () => 1000,
      }),
      rootInvocation: jest.fn().mockReturnValue({
        function: () => ({
          switch: () => (xdr.SorobanAuthorizedFunctionType as any).sorobanAuthorizedFunctionTypeContractFn(),
          contractFn: () => ({
            contractAddress: () => Buffer.from(new Uint8Array(32).fill(0)),
            functionName: () => ({ toString: () => "swap_exact_tokens_for_tokens" }),
            args: () => [
                {}, {}, {}, { type: 'address' } // to
            ],
          }),
        }),
      }),
    };

    jest.spyOn(Address, "fromScVal").mockImplementation((scval: any) => {
        // Return router for contract address, and malicious address for the 'to' arg
        if (scval && scval.type === 'address') return new Address("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
        return new Address(SOROSWAP_ROUTER);
    });

    const mockSimResult = {
      result: {
        auth: [mockAuthEntry],
      },
    };

    const mockSorobanServer = (smartWallet as any).server;
    (mockSorobanServer.simulateTransaction as jest.Mock).mockResolvedValue(mockSimResult);

    const dummyTx = { toXDR: () => "mock" } as Transaction;
    
    await expect(
      smartWallet.sign(SMART_WALLET_ADDRESS, dummyTx, CREDENTIAL_ID)
    ).rejects.toThrow(/DeFi Validation Failed: Swap 'to' address/);
  });
});
