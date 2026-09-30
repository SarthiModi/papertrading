import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().lowercase().email().max(255).required(),
  // bcrypt only uses the first 72 bytes of a password, so we cap the length there.
  password: Joi.string().min(8).max(72).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().max(72).required(),
});
