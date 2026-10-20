import { Router } from 'express';
import { KYCService, kycService } from '../services/kyc/kyc-service';

export function setupKycRoutes(service: KYCService = kycService): Router {
  const router = Router();

  // Get KYC Status
  router.get('/status', async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const status = await service.getStatus(userId);
      res.json(status);
    } catch {
      res.status(500).json({ error: 'Failed to fetch KYC status' });
    }
  });

  // Trigger Identity Verification
  router.post('/verify', async (req, res) => {
    try {
      const userId = req.user?.userId;
      const { documentData } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await service.verifyUser(userId, documentData);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Identity verification failed' });
    }
  });

  // Run Manual Sanctions Check
  router.post('/sanctions-check', async (req, res) => {
    try {
      const userId = req.user?.userId;
      const { walletAddress } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { sanctioned } = await service.checkSanctions(userId, walletAddress);
      res.json({ isSanctioned: sanctioned });
    } catch {
      res.status(500).json({ error: 'Sanctions check failed' });
    }
  });

  return router;
}

export const kycRoutes = setupKycRoutes();
