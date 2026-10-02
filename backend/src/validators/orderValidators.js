import Joi from 'joi';

// Accepts a number or numeric string, requires > 0 and at most 4 decimals, and returns it as a STRING
// (strings keep exact decimals all the way into PostgreSQL NUMERIC).
const priceField = Joi.alternatives()
  .try(Joi.number(), Joi.string())
  .custom((value, helpers) => {
    const text = String(value);
    if (!/^\d{1,8}(\.\d{1,4})?$/.test(text) || Number(text) <= 0) return helpers.error('any.invalid');
    return text;
  }, 'price')
  .messages({ 'any.invalid': 'limitPrice must be a positive number with at most 4 decimals' });

export const createOrderSchema = Joi.object({
  symbol: Joi.string().uppercase().pattern(/^[A-Z.]{1,10}$/).required(),
  side: Joi.string().valid('buy', 'sell').required(),
  orderType: Joi.string().valid('market', 'limit').required(),
  quantity: Joi.number().integer().min(1).max(10000).required(),
  // limit orders MUST send limitPrice; market orders must NOT.
  limitPrice: Joi.when('orderType', { is: 'limit', then: priceField.required(), otherwise: Joi.forbidden() }),
  priority: Joi.number().valid(1, 2).default(1), // 1 normal, 2 high (job-queue priority demo)
});

export const idempotencyKeySchema = Joi.string().pattern(/^[A-Za-z0-9_-]{8,100}$/).required();
export const idParam = Joi.object({ id: Joi.string().pattern(/^\d{1,18}$/).required() });
export const watchlistAddSchema = Joi.object({ symbol: Joi.string().uppercase().pattern(/^[A-Z.]{1,10}$/).required() });
