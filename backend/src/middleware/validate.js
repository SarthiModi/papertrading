import { ApiError } from '../utils/apiResponse.js';

// validate(schema, 'body') checks req.body against a Joi schema.
// On success the cleaned value is stored on req.validated[source].
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      const message = error.details.map((d) => d.message).join('; ');
      return next(new ApiError(400, 'VALIDATION_ERROR', message));
    }
    req.validated = { ...(req.validated || {}), [source]: value };
    next();
  };
}
