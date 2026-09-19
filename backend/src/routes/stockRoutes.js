import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { list, detail, history, symbolParam, listQuery, historyQuery } from '../controllers/stockController.js';

const router = Router();
router.use(requireAuth);
router.get('/', validate(listQuery, 'query'), list);
router.get('/:symbol', validate(symbolParam, 'params'), detail);
router.get('/:symbol/history', validate(symbolParam, 'params'), validate(historyQuery, 'query'), history);

export default router;
