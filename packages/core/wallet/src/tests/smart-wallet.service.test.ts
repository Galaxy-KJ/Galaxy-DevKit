import { SmartWalletService } from "../smart-wallet.service";
import { WebAuthNProvider } from "../../auth/src/providers/WebAuthNProvider";
import { Transaction, xdr } from "@stellar/stellar-sdk";
import { Api } from "@stellar/stellar-sdk/rpc";



const mockAssembledTx = {
     build: jest.fn().mockReturnValue({
          toEnvelope: jest.fn().mockReturnValue({
               toXDR: jest.fn(() => "VALID_XDR_BASE64"),
          }),
     }),
};

jest.mock("@stellar/stellar-sdk/rpc", () => {
     const actual = jest.requireActual("@stellar/stellar-sdk/rpc");
     return {
          ...actual,
          assembleTransaction: jest.fn(() => mockAssembledTx),
          Server: jest.fn().mockImplementation(() => ({
               simulateTransaction: jest.fn(),
          })),
     };
});

jest.mock("../../auth/src/providers/WebAuthNProvider", () => {
     const actual = jest.requireActual("../../auth/src/providers/WebAuthNProvider");
     return {
          ...actual,
          convertSignatureDERtoCompact: jest.fn(() => new Uint8Array(64).fill(0xcd)),
     };
});



const MOCK_CONTRACT_ADDRESS =
     "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

function makeAuthEntry() {
     const entry = {
          toXDR: jest.fn(() => Buffer.alloc(32, 0xab)),
          credentials: jest.fn(),
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("SmartWalletService", () => {
     let service: SmartWalletService;
     let mockServer: { simulateTransaction: jest.Mock };
     let mockCredentialsGet: jest.Mock;
     const sorobanTx = {} as unknown as Transaction;
     const factoryTx = {} as unknown as Transaction;
     const publicKey = new Uint8Array(65).fill(0x04);

     beforeEach(() => {
          const { Server } = jest.requireMock("@stellar/stellar-sdk/rpc");
          mockServer = { simulateTransaction: jest.fn() };
          (Server as jest.Mock).mockImplementation(() => mockServer);

          const mockProvider = { rpId: "localhost" } as unknown as WebAuthNProvider;
          service = new SmartWalletService(mockProvider, "https://rpc.example.com");

          mockCredentialsGet = jest.fn().mockResolvedValue({
               response: {
                    authenticatorData: new ArrayBuffer(37),
                    clientDataJSON: new ArrayBuffer(100),
                    signature: new ArrayBuffer(72),
               },
          });

          Object.defineProperty(global, "navigator", {
               value: { credentials: { get: mockCredentialsGet } },
               writable: true,
          });

          jest.spyOn(Api, "isSimulationError").mockReturnValue(false);
     });

     afterEach(() => jest.clearAllMocks());

     // -------------------------------------------------------------------------
     describe("sign()", () => {
          function setupHappyPath() {
               const authEntry = makeAuthEntry();
               mockServer.simulateTransaction.mockResolvedValue(makeSimResult(authEntry));
               return authEntry;
          }

          it("returns a non-empty XDR string", async () => {
               setupHappyPath();
               const result = await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk");
               expect(typeof result).toBe("string");
               expect(result.length).toBeGreaterThan(0);
          });

          it("calls simulateTransaction with the provided transaction", async () => {
               setupHappyPath();
               await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk");
               expect(mockServer.simulateTransaction).toHaveBeenCalledWith(sorobanTx);
          });

          it("throws if simulation returns an error", async () => {
               jest.spyOn(Api, "isSimulationError").mockReturnValue(true);
               mockServer.simulateTransaction.mockResolvedValue({ error: "insufficient fee" });

               await expect(
                    service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk")
               ).rejects.toThrow("Simulation failed");
          });

          it("throws if simulation returns no auth entries", async () => {
               mockServer.simulateTransaction.mockResolvedValue({ result: { auth: [] } });

               await expect(
                    service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk")
               ).rejects.toThrow("no auth entries");
          });

          it("WebAuthn challenge is exactly 32 bytes (SHA-256 of auth entry)", async () => {
               setupHappyPath();
               await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk");

               const { challenge } = mockCredentialsGet.mock.calls[0][0].publicKey;
               expect(challenge.byteLength).toBe(32);
          });

          it("includes the credentialId in allowCredentials", async () => {
               setupHappyPath();
               await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk");

               const { allowCredentials } = mockCredentialsGet.mock.calls[0][0].publicKey;
               expect(allowCredentials[0].type).toBe("public-key");
               expect(allowCredentials[0].id.byteLength).toBeGreaterThan(0);
          });

          it("throws if WebAuthn returns null (user cancelled)", async () => {
               setupHappyPath();
               mockCredentialsGet.mockResolvedValue(null);

               await expect(
                    service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk")
               ).rejects.toThrow("cancelled or timed out");
          });

          it("calls credentials() to attach the signed auth entry", async () => {
               const authEntry = setupHappyPath();
               await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk");

               // credentials() is called twice: once to read nonce/expiry, once to write the signature.
               expect(authEntry.credentials).toHaveBeenCalled();
          });

          it("uses rpId from the webAuthnProvider", async () => {
               setupHappyPath();
               await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk");

               const { rpId } = mockCredentialsGet.mock.calls[0][0].publicKey;
               expect(rpId).toBe("localhost");
          });

          it("calls assembleTransaction after attaching the signature", async () => {
               setupHappyPath();
               const { assembleTransaction } = jest.requireMock("@stellar/stellar-sdk/rpc");
               await service.sign(MOCK_CONTRACT_ADDRESS, sorobanTx, "Y3JlZElk");

               expect(assembleTransaction).toHaveBeenCalled();
          });
     });

     // -------------------------------------------------------------------------
     describe("deploy()", () => {
          it("returns the contract address from the simulation result", async () => {
               mockServer.simulateTransaction.mockResolvedValue({
                    result: {
                         retval: {
                              address: () => ({
                                   contractId: () => ({ toString: () => MOCK_CONTRACT_ADDRESS }),
                              }),
                         },
                    },
               });

               const result = await service.deploy(publicKey, factoryTx);
               expect(result).toBe(MOCK_CONTRACT_ADDRESS);
               expect(result.length).toBeGreaterThan(0);
          });

          it("throws if deploy simulation returns an error", async () => {
               jest.spyOn(Api, "isSimulationError").mockReturnValue(true);
               mockServer.simulateTransaction.mockResolvedValue({ error: "contract error" });

               await expect(service.deploy(publicKey, factoryTx)).rejects.toThrow(
                    "Deploy simulation failed"
               );
          });

          it("throws if factory returns no contract address", async () => {
               mockServer.simulateTransaction.mockResolvedValue({ result: { retval: null } });

               await expect(service.deploy(publicKey, factoryTx)).rejects.toThrow(
                    "Factory did not return a contract address"
               );
          });

          it("calls simulateTransaction with the factory transaction", async () => {
               mockServer.simulateTransaction.mockResolvedValue({
                    result: {
                         retval: {
                              address: () => ({
                                   contractId: () => ({ toString: () => MOCK_CONTRACT_ADDRESS }),
                              }),
                         },
                    },
               });

               await service.deploy(publicKey, factoryTx);
               expect(mockServer.simulateTransaction).toHaveBeenCalledWith(factoryTx);
          });
     });
});
