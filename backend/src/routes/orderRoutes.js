import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createOrderSchema, idParam } from '../validators/orderValidators.js';
import { listQuerySchema } from '../utils/pagination.js';
import { create, list, detail, cancel } from '../controllers/orderController.js';

const router = Router();
router.use(requireAuth);
router.post('/', validate(createOrderSchema), create);
router.get('/', validate(listQuerySchema, 'query'), list);
router.get('/:id', validate(idParam, 'params'), detail);
router.post('/:id/cancel', validate(idParam, 'params'), cancel);
export default router;
