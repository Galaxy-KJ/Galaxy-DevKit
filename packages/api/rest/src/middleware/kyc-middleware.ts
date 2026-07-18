import { Request, Response, NextFunction } from 'express';
import { kycService } from '../services/kyc/kyc-service';

export const requireKYC = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Assuming auth middleware sets req.user
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // RBAC Integration: bypass for specific roles (e.g. admin)
    if (userRole === 'admin' || userRole === 'system') {
      return next();
    }

    const kycStatus = await kycService.getStatus(userId);

    if (!kycStatus || kycStatus.status !== 'approved') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Verified KYC status is required for this operation.',
        currentStatus: kycStatus?.status || 'unverified'
      });
    }

    // Pass the KYC status in the request for downstream use if needed
    (req as any).kycStatus = kycStatus;
    
    next();
  } catch (error) {
    console.error('KYC Middleware Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
