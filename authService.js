import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { query, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/apiResponse.js';

// A real bcrypt hash of a random string. When the email does not exist we still run a
// comparison against it, so response time does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

function publicUser(row) {
  // NEVER include password_hash here.
  return { id: String(row.id), name: row.name, email: row.email, createdAt: row.created_at };
}

// Creating the user AND their cash account is ONE transaction: both happen or neither.
export async function registerUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  try {
    return await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id, name, email, created_at`,
        [name, email, passwordHash]
      );
      const user = userResult.rows[0];
      await client.query('INSERT INTO user_accounts (user_id, available_balance) VALUES ($1, $2)', [
        user.id,
        config.startingBalance,
      ]);
      return publicUser(user);
    });
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw err;
  }
}

export async function loginUser({ email, password }) {
  const { rows } = await query(
    'SELECT id, name, email, password_hash, created_at FROM users WHERE lower(email) = lower($1)',
    [email]
  );
  const user = rows[0];
  const matches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  return publicUser(user);
}

export async function getUserById(userId) {
  const { rows } = await query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw new ApiError(401, 'UNAUTHENTICATED', 'User no longer exists');
  return publicUser(rows[0]);
}

export function createToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}
