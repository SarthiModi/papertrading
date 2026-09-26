import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiError } from '../utils/apiResponse.js';

export const COOKIE_NAME = 'pb_token';

// Reads the JWT from the HttpOnly cookie, verifies it, and sets req.userId.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new ApiError(401, 'UNAUTHENTICATED', 'Please log in'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = String(payload.sub);
    next();
  } catch (err) {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Session expired or invalid'));
  }
}

// Used by the WebSocket server, which has no Express req.
export function verifyToken(token) {
  try {
    return String(jwt.verify(token, config.jwtSecret).sub);
  } catch (err) {
    return null;
  }
}
