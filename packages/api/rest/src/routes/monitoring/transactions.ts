import express, { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { validate } from '../../middleware/validate';
import { TransactionMonitoringService } from '../../services/monitoring/transaction-monitoring.service';
import { TeamsError } from '../../types/teams-types';
import { addAccountSchema, createTransactionRuleSchema, organizationParamSchema, paginationSchema, resourceIdParamSchema, updateTransactionRuleSchema } from '../../validators/transaction-monitoring-validators';

function userId(req: Request, res: Response): string | null {
  if (req.user) return req.user.userId;
  res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Authentication required', details: {} } }); return null;
}
function handle(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof TeamsError) { res.status(error.statusCode).json({ error: { code: error.code, message: error.message, details: error.details } }); return; }
  if (error instanceof Error && error.message.endsWith('not found')) { res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message, details: {} } }); return; }
  next(error);
}

/** REST configuration API for organization-scoped transaction monitoring. */
export function setupTransactionMonitoringRoutes(service: TransactionMonitoringService = new TransactionMonitoringService()): express.Router {
  const router = express.Router();
  router.use(authenticate(), auditRequest());
  router.post('/organizations/:organizationId/accounts', validate(organizationParamSchema, 'params'), validate(addAccountSchema, 'body'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { const account = await service.addAccount(uid, req.params.organizationId, req.body.accountAddress, req.body.network); res.status(201).json({ account }); } catch (error) { handle(error, res, next); }
  });
  router.get('/organizations/:organizationId/accounts', validate(organizationParamSchema, 'params'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { res.json({ accounts: await service.listAccounts(uid, req.params.organizationId) }); } catch (error) { handle(error, res, next); }
  });
  router.delete('/organizations/:organizationId/accounts/:id', validate(resourceIdParamSchema, 'params'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { await service.removeAccount(uid, req.params.organizationId, req.params.id); res.status(204).send(); } catch (error) { handle(error, res, next); }
  });
  router.post('/organizations/:organizationId/rules', validate(organizationParamSchema, 'params'), validate(createTransactionRuleSchema, 'body'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { const rule = await service.createRule(uid, req.params.organizationId, req.body); res.status(201).json({ rule }); } catch (error) { handle(error, res, next); }
  });
  router.get('/organizations/:organizationId/rules', validate(organizationParamSchema, 'params'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { res.json({ rules: await service.listRules(uid, req.params.organizationId) }); } catch (error) { handle(error, res, next); }
  });
  router.patch('/organizations/:organizationId/rules/:id', validate(resourceIdParamSchema, 'params'), validate(updateTransactionRuleSchema, 'body'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { res.json({ rule: await service.updateRule(uid, req.params.organizationId, req.params.id, req.body) }); } catch (error) { handle(error, res, next); }
  });
  router.delete('/organizations/:organizationId/rules/:id', validate(resourceIdParamSchema, 'params'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { await service.removeRule(uid, req.params.organizationId, req.params.id); res.status(204).send(); } catch (error) { handle(error, res, next); }
  });
  router.get('/organizations/:organizationId/events', validate(organizationParamSchema, 'params'), validate(paginationSchema, 'query'), async (req, res, next) => {
    const uid = userId(req, res); if (!uid) return; try { res.json({ events: await service.listEvents(uid, req.params.organizationId, { limit: Number(req.query.limit), offset: Number(req.query.offset) }) }); } catch (error) { handle(error, res, next); }
  });
  return router;
}
