import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listQuerySchema } from '../utils/pagination.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getPortfolio, getHoldings, getBalance, getTransactions } from '../services/portfolioService.js';

const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => sendSuccess(res, await getPortfolio(req.userId)));
router.get('/holdings', async (req, res) => sendSuccess(res, { holdings: await getHoldings(req.userId) }));
router.get('/balance', async (req, res) => sendSuccess(res, await getBalance(req.userId)));
router.get('/transactions', validate(listQuerySchema, 'query'), async (req, res) =>
  sendSuccess(res, { transactions: await getTransactions(req.userId, req.validated.query) }));
export default router;
