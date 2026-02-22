import { Transaction, xdr, StrKey } from "@stellar/stellar-sdk";
import { Server, Api, assembleTransaction } from "@stellar/stellar-sdk/rpc";
import { WebAuthNProvider } from "../auth/src/providers/WebAuthNProvider";
import { convertSignatureDERtoCompact } from "../auth/src/providers/WebAuthNProvider";

// Encodes bytes as base64url (no padding) for use as a WebAuthn challenge.
function toBase64Url(bytes: Uint8Array): string {
     return Buffer.from(bytes)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
}

// Decodes a base64url string to Uint8Array, avoiding the Buffer/ArrayBufferLike mismatch.
function base64UrlToUint8Array(base64url: string): Uint8Array {
     const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
     return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export class SmartWalletService {
     private server: Server;

     constructor(
          private webAuthnProvider: WebAuthNProvider,
          private rpcUrl: string
     ) {
          this.server = new Server(rpcUrl);
     }

     /**
      * Simulates the tx, uses the auth entry hash as the WebAuthn challenge,
      * attaches the passkey signature, and returns fee-less XDR for the sponsor.
      */
     async sign(
          contractAddress: string,
          sorobanTx: Transaction,
          credentialId: string
     ): Promise<string> {
          const simResult = await this.server.simulateTransaction(sorobanTx);

          if (Api.isSimulationError(simResult)) {
               throw new Error(`Simulation failed: ${simResult.error}`);
          }

          if (!simResult.result?.auth?.length) {
               throw new Error("Simulation returned no auth entries.");
          }

          const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

          // crypto.subtle.digest() needs a plain ArrayBuffer — slice to avoid SharedArrayBuffer.
          const authEntryBytes = authEntry.toXDR();
          const authEntryArrayBuffer = authEntryBytes.buffer.slice(
               authEntryBytes.byteOffset,
               authEntryBytes.byteOffset + authEntryBytes.byteLength
          ) as ArrayBuffer;

          const authEntryHash = new Uint8Array(
               await crypto.subtle.digest("SHA-256", authEntryArrayBuffer)
          );

          const challenge = toBase64Url(authEntryHash);

          const pkCredential = (await navigator.credentials.get({
               publicKey: {
                    challenge: Buffer.from(base64UrlToUint8Array(challenge)),
                    rpId: (this.webAuthnProvider as any).rpId,
                    allowCredentials: [
                         {
                              type: "public-key" as const,
                              id: Buffer.from(base64UrlToUint8Array(credentialId)),
                         },
                    ],
                    userVerification: "required",
                    timeout: 60000,
               },
          })) as PublicKeyCredential | null;

          if (!pkCredential) {
               throw new Error("WebAuthn authentication was cancelled or timed out.");
          }

          const assertionResponse = pkCredential.response as AuthenticatorAssertionResponse;

          const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
          const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
          const compactSig = convertSignatureDERtoCompact(assertionResponse.signature);

          // scvBytes() is typed to Buffer, so wrap each Uint8Array field.
          const signerSignature = xdr.ScVal.scvMap([
               new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("authenticator_data"),
                    val: xdr.ScVal.scvBytes(Buffer.from(authenticatorData)),
               }),
               new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("client_data_json"),
                    val: xdr.ScVal.scvBytes(Buffer.from(clientDataJSON)),
               }),
               new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("id"),
                    val: xdr.ScVal.scvBytes(Buffer.from(base64UrlToUint8Array(credentialId))),
               }),
               new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("signature"),
                    val: xdr.ScVal.scvBytes(Buffer.from(compactSig)),
               }),
          ]);

          authEntry.credentials(
               xdr.SorobanCredentials.sorobanCredentialsAddress(
                    new xdr.SorobanAddressCredentials({
                         address: xdr.ScAddress.scAddressTypeContract(
                              // Cast needed — SDK types Hash as opaque but Buffer carries the same bytes.
                              Buffer.from(StrKey.decodeContract(contractAddress)) as unknown as xdr.Hash
                         ),
                         nonce: authEntry.credentials().address().nonce(),
                         signatureExpirationLedger:
                              authEntry.credentials().address().signatureExpirationLedger(),
                         signature: signerSignature,
                    })
               )
          );

          simResult.result.auth[0] = authEntry;

          const signedTx = assembleTransaction(sorobanTx, simResult).build();
          return signedTx.toEnvelope().toXDR("base64");
     }

     /**
      * Simulates the factory tx and returns the deployed contract address.
      * Caller is responsible for building the factory invocation transaction.
      *
      * TODO: move factory tx construction here once the factory ABI is finalised.
      */
     async deploy(
          _publicKey65Bytes: Uint8Array,
          factoryTx: Transaction
     ): Promise<string> {
          const deployResult = await this.server.simulateTransaction(factoryTx);

          if (Api.isSimulationError(deployResult)) {
               throw new Error(`Deploy simulation failed: ${deployResult.error}`);
          }

          const contractAddress: string | undefined = (deployResult as any).result
               ?.retval?.address()
               ?.contractId()
               ?.toString("hex");

          if (!contractAddress) {
               throw new Error("Factory did not return a contract address.");
          }

          return contractAddress;
     }
}