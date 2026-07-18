import { Router } from 'express';
import { kycService } from '../services/kyc/kyc-service';

const router = Router();

// Get KYC Status
router.get('/status', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = await kycService.getStatus(userId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch KYC status' });
  }
});

// Trigger Identity Verification
router.post('/verify', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { documentData } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await kycService.verifyUser(userId, documentData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Identity verification failed' });
  }
});

// Run Manual Sanctions Check
router.post('/sanctions-check', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { walletAddress } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isSanctioned = await kycService.checkSanctions(userId, walletAddress);
    res.json({ isSanctioned });
  } catch (error) {
    res.status(500).json({ error: 'Sanctions check failed' });
  }
});

export const kycRoutes = router;
