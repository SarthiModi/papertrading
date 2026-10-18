import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { watchlistAddSchema } from '../validators/orderValidators.js';
import { symbolParam } from '../controllers/stockController.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../services/watchlistService.js';

const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => sendSuccess(res, { watchlist: await getWatchlist(req.userId) }));
router.post('/', validate(watchlistAddSchema), async (req, res) => {
  await addToWatchlist(req.userId, req.validated.body.symbol);
  sendSuccess(res, { watchlist: await getWatchlist(req.userId) }, 201);
});
router.delete('/:symbol', validate(symbolParam, 'params'), async (req, res) => {
  await removeFromWatchlist(req.userId, req.validated.params.symbol);
  sendSuccess(res, { watchlist: await getWatchlist(req.userId) });
});
export default router;
