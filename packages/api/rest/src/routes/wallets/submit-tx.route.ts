/**
 * @fileoverview Fee-sponsor endpoint for non-custodial smart wallet transactions
 * @description Wraps a signed (fee-less) Soroban XDR in a fee-bump envelope
 *              using the server's sponsor account, submits to Stellar, and logs the event.
 *              The backend never signs user operations or touches user keys.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { Router, Request, Response, NextFunction } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  Keypair,
  TransactionBuilder,
  Networks,
  Transaction,
  FeeBumpTransaction,
  rpc,
} from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Environment defaults
// ---------------------------------------------------------------------------
const DEFAULT_STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_BASE_FEE = "1000000"; // 0.1 XLM

// ---------------------------------------------------------------------------
// Supabase client (singleton, matches user-service.ts pattern)
// ---------------------------------------------------------------------------
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseURL = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseURL || !supabaseServiceRoleKey) {
      throw new Error(
        "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
      );
    }

    supabaseClient = createClient(supabaseURL, supabaseServiceRoleKey);
  }
  return supabaseClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse and lightly validate the incoming signed XDR.
 * Throws a descriptive string on failure.
 */
function parseSignedXdr(signedTxXdr: string): Transaction {
  const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
  try {
    const tx = TransactionBuilder.fromXDR(
      signedTxXdr,
      networkPassphrase
    );

    if (tx instanceof FeeBumpTransaction) {
      throw "XDR is already a fee-bump transaction";
    }

    return tx as Transaction;
  } catch (err) {
    if (typeof err === "string") throw err;
    throw "Unable to decode XDR — ensure it is a valid signed Soroban transaction envelope";
  }
}

/**
 * Build + sign the fee-bump envelope.
 * FEE_SPONSOR_SECRET_KEY signs the outer envelope only.
 */
function buildFeeBump(innerTx: Transaction): FeeBumpTransaction {
  const secretKey = process.env.FEE_SPONSOR_SECRET_KEY;
  if (!secretKey) {
    throw new Error("FEE_SPONSOR_SECRET_KEY is not configured");
  }

  const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
  const baseFee = process.env.FEE_BUMP_BASE_FEE || DEFAULT_BASE_FEE;
  const sponsorKeypair = Keypair.fromSecret(secretKey);

  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    sponsorKeypair,
    baseFee,
    innerTx,
    networkPassphrase
  );

  feeBump.sign(sponsorKeypair);
  return feeBump;
}

/**
 * Poll Stellar RPC until the transaction is confirmed or times out.
 */
async function pollTransaction(
  server: rpc.Server,
  hash: string,
  timeoutMs = 30_000,
  intervalMs = 2_000
): Promise<rpc.Api.GetTransactionResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const resp = await server.getTransaction(hash);
    if (resp.status !== "NOT_FOUND") {
      return resp;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Transaction ${hash} not confirmed within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
const router = Router();

router.post(
  "/submit-tx",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabaseClient();

      // ---- 1. Validate request body --------------------------------
      const { signedTxXdr, walletId } = req.body ?? {};

      if (!signedTxXdr || typeof signedTxXdr !== "string") {
        return res.status(400).json({
          error: "Missing or invalid `signedTxXdr` — expected a base-64 XDR string",
        });
      }

      if (!walletId || typeof walletId !== "string") {
        return res.status(400).json({
          error: "Missing or invalid `walletId`",
        });
      }

      // ---- 2. Parse / validate XDR ----------------------------------
      let innerTx: Transaction;
      try {
        innerTx = parseSignedXdr(signedTxXdr);
      } catch (xdrError) {
        return res.status(400).json({ error: String(xdrError) });
      }

      // ---- 3. Verify wallet exists in smart_wallets -----------------
      const { data: wallet, error: walletError } = await supabase
        .from("smart_wallets")
        .select("id, user_id")
        .eq("id", walletId)
        .single();

      if (walletError || !wallet) {
        return res.status(404).json({
          error: `Wallet ${walletId} not found in smart_wallets`,
        });
      }

      // ---- 4. Build fee-bump ----------------------------------------
      let feeBumpTx: FeeBumpTransaction;
      try {
        feeBumpTx = buildFeeBump(innerTx);
      } catch (buildErr) {
        console.error("[submit-tx] Fee-bump build failed");
        return res.status(500).json({
          error: "Internal error building fee-bump transaction",
        });
      }

      // ---- 5. Submit to Stellar RPC ---------------------------------
      let rpcResult: rpc.Api.SendTransactionResponse;
      try {
        const server = new rpc.Server(process.env.STELLAR_RPC_URL || DEFAULT_STELLAR_RPC_URL);
        rpcResult = await server.sendTransaction(feeBumpTx);
      } catch (rpcErr: any) {
        console.error(
          "[submit-tx] Stellar RPC submission failed:",
          rpcErr?.message ?? rpcErr
        );
        return res.status(502).json({
          error: "Stellar RPC submission failed",
          detail: rpcErr?.message,
        });
      }

      if (rpcResult.status === "ERROR") {
        console.error(
          "[submit-tx] Stellar RPC returned ERROR:",
          rpcResult.errorResult?.toXDR("base64")
        );
        return res.status(502).json({
          error: "Stellar RPC returned an error",
          detail: rpcResult.errorResult?.toXDR("base64"),
        });
      }

      // ---- 6. Await confirmation ------------------------------------
      const txHash = rpcResult.hash;
      let ledger: number | undefined;

      if (rpcResult.status === "PENDING") {
        const server = new rpc.Server(process.env.STELLAR_RPC_URL || DEFAULT_STELLAR_RPC_URL);
        const confirmed = await pollTransaction(server, txHash);
        if (confirmed.status === "SUCCESS") {
          ledger = confirmed.ledger;
        } else {
          console.error(
            "[submit-tx] Transaction failed after submission:",
            confirmed.status
          );
          return res.status(502).json({
            error: "Transaction failed after submission",
            detail: confirmed.status,
          });
        }
      }

      // ---- 7. Log to wallet_events ----------------------------------
      try {
        await supabase.from("wallet_events").insert({
          wallet_id: wallet.id,
          user_id: wallet.user_id,
          event_type: "TRANSACTION_SUBMITTED",
          metadata: { transactionHash: txHash },
        });
      } catch (logErr) {
        console.error("[submit-tx] Failed to log wallet event:", logErr);
      }

      // ---- 8. Respond -----------------------------------------------
      return res.status(200).json({
        transactionHash: txHash,
        ledger: ledger ?? null,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;