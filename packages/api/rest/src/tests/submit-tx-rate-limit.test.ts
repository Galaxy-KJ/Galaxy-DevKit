import express, { Express } from "express";
import request from "supertest";

// Mock Supabase
const mockSingle = jest.fn();
const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

// Mock AuditLogger to prevent real logging crashes
jest.mock("../services/audit-logger", () => {
  return {
    AuditLogger: jest.fn().mockImplementation(() => ({
      log: jest.fn().mockResolvedValue(null),
    })),
  };
});

// Set environment variables BEFORE importing route
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

import submitTxRoute from "../routes/wallets/submit-tx.route";

// App factory
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(submitTxRoute);
  return app;
}

const VALID_BODY = {
  signedTxXdr: "AAAA_valid_xdr_placeholder",
  walletId: "known-wallet",
};

describe("POST /submit-tx Rate Limiting", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    
    // Mock user identification via wallet query
    mockSingle.mockResolvedValue({
      data: { user_id: "user-123" },
      error: null,
    });
  });

  it("blocks user after 10 requests within a minute", async () => {
    // Send 10 requests (Rate limiting runs before the endpoint logic, which may fail due to unmocked Stellar elements, but that doesn't matter for the 429 code check)
    for (let i = 0; i < 10; i++) {
         await request(app).post("/submit-tx").send(VALID_BODY);
    }

    // 11th request should exceed user rate limit
    const res = await request(app)
      .post("/submit-tx")
      .send(VALID_BODY)
      .expect(429);

    expect(res.body).toEqual({
      error: "Too many transactions. Try again in 60 seconds.",
      retryAfter: 60,
    });
    
    expect(res.headers["retry-after"]).toBeDefined();
  });
});
