/**
 * @fileoverview Multi-signature approval workflow routes
 * @description POST /api/v1/approvals/propose and /api/v1/approvals/approve
 */

import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { getApprovalService } from '../../services/approval-service';

export function setupApprovalsRoutes(): express.Router {
  const router = express.Router();
  const approvalService = getApprovalService();

  router.use(authenticate(), auditRequest());

  router.post('/propose', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        organizationId,
        walletAddress,
        transactionXdr,
        creatorPublicKey,
        multisigConfig,
      } = req.body ?? {};

      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'organizationId is required',
            details: {},
          },
        });
      }

      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'walletAddress is required',
            details: {},
          },
        });
      }

      if (!transactionXdr || typeof transactionXdr !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'transactionXdr is required',
            details: {},
          },
        });
      }

      if (!creatorPublicKey || typeof creatorPublicKey !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'creatorPublicKey is required',
            details: {},
          },
        });
      }

      const proposalId = await approvalService.propose({
        organizationId,
        walletAddress,
        transactionXdr,
        creatorPublicKey,
        multisigConfig,
      });

      return res.status(201).json({ proposalId });
    } catch (error) {
      next(error);
    }
  });

  router.post('/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { proposalId, signerPublicKey, signature } = req.body ?? {};

      if (!proposalId || typeof proposalId !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'proposalId is required',
            details: {},
          },
        });
      }

      if (!signerPublicKey || typeof signerPublicKey !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'signerPublicKey is required',
            details: {},
          },
        });
      }

      if (!signature || typeof signature !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'signature is required',
            details: {},
          },
        });
      }

      try {
        const proposal = await approvalService.approve({
          proposalId,
          signerPublicKey,
          signature,
        });

        return res.status(200).json({ proposal });
      } catch (approvalError) {
        const message =
          approvalError instanceof Error ? approvalError.message : 'Approval failed';

        if (message.includes('Invalid signature')) {
          return res.status(400).json({
            error: {
              code: 'INVALID_SIGNATURE',
              message,
              details: {},
            },
          });
        }

        if (message.includes('not found')) {
          return res.status(404).json({
            error: {
              code: 'PROPOSAL_NOT_FOUND',
              message,
              details: {},
            },
          });
        }

        throw approvalError;
      }
    } catch (error) {
      next(error);
    }
  });

  router.get('/:proposalId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = approvalService.getProposal(req.params.proposalId);
      if (!proposal) {
        return res.status(404).json({
          error: {
            code: 'PROPOSAL_NOT_FOUND',
            message: 'Proposal not found',
            details: {},
          },
        });
      }

      return res.status(200).json({ proposal });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
