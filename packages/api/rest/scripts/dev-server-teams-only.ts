/**
 * @fileoverview Minimal dev server that mounts ONLY the /teams routes.
 * @description Used to validate the Team Accounts endpoints (Issue #313) without
 *              pulling in defi/monitoring/approvals routes — those depend on
 *              cross-workspace packages that would need to be built first.
 *              Do NOT ship this file to production; use src/index.ts.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../../.env.local') });

import express from 'express';
import { authenticate } from '../src/middleware/auth';
import { auditRequest } from '../src/middleware/audit';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler';
import { setupTeamRoutes } from '../src/routes/teams';

// Hardcoded so this dev server never collides with a `npm start` on the
// default 3000. Override with TEAMS_DEV_PORT if you really need to.
const port = Number(process.env.TEAMS_DEV_PORT ?? 3001);
const host = '127.0.0.1';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    scope: 'teams-only',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/teams', setupTeamRoutes());

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`[teams-only] listening on http://${host}:${port}`);
  console.log(`[teams-only] health:  http://${host}:${port}/health`);
  console.log(`[teams-only] routes:  http://${host}:${port}/api/v1/teams/organizations`);
});
