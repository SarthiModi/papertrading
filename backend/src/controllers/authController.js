import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { COOKIE_NAME } from '../middleware/auth.js';
import { registerUser, loginUser, getUserById, createToken } from '../services/authService.js';
import { sendSuccess } from '../utils/apiResponse.js';

function setAuthCookie(res, userId) {
  const token = createToken(userId);
  const { exp } = jwt.decode(token);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production', // needs HTTPS in production
    maxAge: exp * 1000 - Date.now(),
  });
}

export async function register(req, res) {
  const user = await registerUser(req.validated.body);
  setAuthCookie(res, user.id);
  sendSuccess(res, { user }, 201);
}

export async function login(req, res) {
  const user = await loginUser(req.validated.body);
  setAuthCookie(res, user.id);
  sendSuccess(res, { user });
}

export function logout(req, res) {
  res.clearCookie(COOKIE_NAME);
  sendSuccess(res, { loggedOut: true });
}

export async function me(req, res) {
  sendSuccess(res, { user: await getUserById(req.userId) });
}