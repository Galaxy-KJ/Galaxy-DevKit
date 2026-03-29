/**
 * @fileoverview Wallet route aggregator
 * @description Mounts all /wallets sub-routes
 *
 * Usage in main app:
 *   import walletRoutes from "./routes/wallets";
 *   app.use("/api/v1/wallets", walletRoutes);
 */

import { Router } from "express";
import submitTxRoute from "./submit-tx.route";

const router = Router();

// POST /api/v1/wallets/submit-tx
router.use(submitTxRoute);

export default router;