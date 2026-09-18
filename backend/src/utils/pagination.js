import Joi from 'joi';
export const listQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
  status: Joi.string().valid('pending', 'processing', 'partially_filled', 'filled', 'rejected', 'cancelled', 'failed'),
});
