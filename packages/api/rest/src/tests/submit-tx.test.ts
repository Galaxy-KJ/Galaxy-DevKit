/**
 * @fileoverview Unit tests for POST /submit-tx (fee-sponsor endpoint)
 * @description All Stellar RPC and Supabase calls are mocked — no network access.
 */

import express, { Express } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockSingle = jest.fn();
const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom = jest.fn((table: string) => {
  if (table === "wallet_events") {
    return { insert: mockInsert };
  }
  return { select: mockSelect };
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

// ---------------------------------------------------------------------------
// Stellar SDK mocks
// ---------------------------------------------------------------------------
const FAKE_HASH = "abc123def456";

const mockSendTransaction = jest.fn().mockResolvedValue({
  status: "PENDING",
  hash: FAKE_HASH,
});

const mockGetTransaction = jest.fn().mockResolvedValue({
  status: "SUCCESS",
  ledger: 42,
});

jest.mock("@stellar/stellar-sdk", () => {
  class Transaction {}
  class FeeBumpTransaction {
    hash = FAKE_HASH;
    sign = jest.fn();
  }

  return {
    Keypair: {
      fromSecret: jest.fn(() => ({
        publicKey: () => "GABCDEF",
        sign: jest.fn(),
      })),
    },
    TransactionBuilder: {
      fromXDR: jest.fn((_xdr: string) => {
        if (_xdr === "INVALID_XDR") throw new Error("bad xdr");
        if (_xdr === "ALREADY_FEE_BUMP") return new FeeBumpTransaction();
        return new Transaction();
      }),
      buildFeeBumpTransaction: jest.fn(() => new FeeBumpTransaction()),
    },
    Networks: { TESTNET: "Test SDF Network ; September 2015" },
    Transaction,
    FeeBumpTransaction,
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        sendTransaction: mockSendTransaction,
        getTransaction: mockGetTransaction,
      })),
      Api: {},
    },
  };
});

// ---------------------------------------------------------------------------
// Import route AFTER mocks
// ---------------------------------------------------------------------------
import submitTxRoute from "../routes/wallets/submit-tx.route";

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(submitTxRoute);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_BODY = {
  signedTxXdr: "AAAA_valid_xdr_placeholder",
  walletId: "known-wallet",
};

function mockWalletFound() {
  mockSingle.mockResolvedValue({
    data: { id: "known-wallet", user_id: "user-1" },
    error: null,
  });
}

function mockWalletNotFound() {
  mockSingle.mockResolvedValue({
    data: null,
    error: { code: "PGRST116", message: "Row not found" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /submit-tx", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEE_SPONSOR_SECRET_KEY =
      "SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE6PGYAIEHBJ2LGXTM6WLMJJK";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    mockWalletFound();
    mockSendTransaction.mockResolvedValue({ status: "PENDING", hash: FAKE_HASH });
    mockGetTransaction.mockResolvedValue({ status: "SUCCESS", ledger: 42 });
    mockInsert.mockResolvedValue({ error: null });
  });

  // ---- Success ----
  it("returns { transactionHash, ledger } on success", async () => {
    const res = await request(buildApp())
      .post("/submit-tx")
      .send(VALID_BODY)
      .expect(200);

    expect(res.body).toEqual({
      transactionHash: FAKE_HASH,
      ledger: 42,
    });
  });

  it("inserts a wallet_events row on success", async () => {
    await request(buildApp()).post("/submit-tx").send(VALID_BODY).expect(200);

    expect(mockFrom).toHaveBeenCalledWith("wallet_events");
    expect(mockInsert).toHaveBeenCalledWith({
      wallet_id: "known-wallet",
      user_id: "user-1",
      event_type: "TRANSACTION_SUBMITTED",
      metadata: { transactionHash: FAKE_HASH },
    });
  });

  it("queries smart_wallets table (not invisible_wallets)", async () => {
    await request(buildApp()).post("/submit-tx").send(VALID_BODY).expect(200);
    expect(mockFrom).toHaveBeenCalledWith("smart_wallets");
  });

  // ---- 400: missing fields ----
  it("rejects missing signedTxXdr with 400", async () => {
    const res = await request(buildApp())
      .post("/submit-tx")
      .send({ walletId: "known-wallet" })
      .expect(400);
    expect(res.body.error).toMatch(/signedTxXdr/);
  });

  it("rejects missing walletId with 400", async () => {
    const res = await request(buildApp())
      .post("/submit-tx")
      .send({ signedTxXdr: "some-xdr" })
      .expect(400);
    expect(res.body.error).toMatch(/walletId/);
  });

  // ---- 400: malformed XDR ----
  it("rejects malformed XDR with 400", async () => {
    const res = await request(buildApp())
      .post("/submit-tx")
      .send({ signedTxXdr: "INVALID_XDR", walletId: "known-wallet" })
      .expect(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejects already-fee-bumped XDR with 400", async () => {
    const res = await request(buildApp())
      .post("/submit-tx")
      .send({ signedTxXdr: "ALREADY_FEE_BUMP", walletId: "known-wallet" })
      .expect(400);
    expect(res.body.error).toMatch(/fee-bump/i);
  });

  // ---- 404: unknown wallet ----
  it("rejects unknown walletId with 404", async () => {
    mockWalletNotFound();
    const res = await request(buildApp())
      .post("/submit-tx")
      .send({ signedTxXdr: "some-xdr", walletId: "ghost-wallet" })
      .expect(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // ---- 502: RPC failure ----
  it("returns 502 when Stellar RPC throws", async () => {
    mockSendTransaction.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(buildApp())
      .post("/submit-tx")
      .send(VALID_BODY)
      .expect(502);
    expect(res.body.error).toMatch(/Stellar RPC/i);
  });

  it("returns 502 when Stellar RPC returns ERROR status", async () => {
    mockSendTransaction.mockResolvedValueOnce({
      status: "ERROR",
      errorResult: { toXDR: () => "error-xdr" },
    });
    const res = await request(buildApp())
      .post("/submit-tx")
      .send(VALID_BODY)
      .expect(502);
    expect(res.body.error).toMatch(/error/i);
  });

  // ---- Security ----
  it("never includes FEE_SPONSOR_SECRET_KEY in error responses", async () => {
    const stellarMock = jest.requireMock("@stellar/stellar-sdk");
    stellarMock.TransactionBuilder.buildFeeBumpTransaction.mockImplementationOnce(
      () => { throw new Error(process.env.FEE_SPONSOR_SECRET_KEY!); }
    );
    const res = await request(buildApp())
      .post("/submit-tx")
      .send(VALID_BODY)
      .expect(500);
    expect(JSON.stringify(res.body)).not.toContain(
      process.env.FEE_SPONSOR_SECRET_KEY
    );
  });

  // ---- Resilience ----
  it("still returns 200 if wallet_events insert fails", async () => {
    mockInsert.mockRejectedValueOnce(new Error("DB write failed"));
    const res = await request(buildApp())
      .post("/submit-tx")
      .send(VALID_BODY)
      .expect(200);
    expect(res.body.transactionHash).toBeDefined();
  });
});