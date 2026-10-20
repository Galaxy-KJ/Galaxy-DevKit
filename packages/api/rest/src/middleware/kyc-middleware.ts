import { Request, Response, NextFunction, RequestHandler } from 'express';
import { KYCStatusRecord } from '../types/kyc-types';
import { KYCService, kycService } from '../services/kyc/kyc-service';

export function createRequireKYC(
  service: Pick<KYCService, 'getStatus'>
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // RBAC Integration: bypass for specific roles (e.g. admin)
    if (userRole === 'admin' || userRole === 'system') {
      next();
      return;
    }

    let kycStatus: KYCStatusRecord | null;
    try {
      kycStatus = await service.getStatus(userId);
    } catch {
      res.status(503).json({ error: 'KYC status unavailable' });
      return;
    }

    if (!kycStatus || kycStatus.status !== 'approved') {
      res.status(403).json({
        error: 'KYC verification required',
        currentStatus: kycStatus?.status ?? 'unverified',
      });
      return;
    }

    (req as Request & { kycStatus?: KYCStatusRecord }).kycStatus = kycStatus;
    next();
  };
}

export const requireKYC = createRequireKYC(kycService);
