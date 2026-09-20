import { sendSuccess, ApiError } from '../utils/apiResponse.js';
import { idempotencyKeySchema } from '../validators/orderValidators.js';
import { placeOrder, listOrders, getOrder, cancelOrder } from '../services/orderService.js';

export async function create(req, res) {
  const { error, value: idempotencyKey } = idempotencyKeySchema.validate(req.get('Idempotency-Key'));
  if (error) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header (8-100 letters, digits, - or _)');
  const { order, duplicate } = await placeOrder(req.userId, { ...req.validated.body, idempotencyKey });
  sendSuccess(res, { order, duplicate }, duplicate ? 200 : 201);
}
export async function list(req, res) {
  sendSuccess(res, { orders: await listOrders(req.userId, req.validated.query) });
}
export async function detail(req, res) {
  sendSuccess(res, { order: await getOrder(req.userId, req.validated.params.id) });
}
export async function cancel(req, res) {
  sendSuccess(res, { order: await cancelOrder(req.userId, req.validated.params.id) });
}