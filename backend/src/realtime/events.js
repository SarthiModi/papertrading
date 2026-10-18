import Joi from 'joi';
import { randomUUID } from 'node:crypto';
import { redis } from '../redis/client.js';

export const EVENTS_CHANNEL = 'pb:events';

const quote = Joi.object({
  symbol: Joi.string().required(),
  price: Joi.string().required(),
  bid: Joi.string(),
  ask: Joi.string(),
  change: Joi.string().allow(null),
  changePercent: Joi.string().allow(null),
  sourceTimestamp: Joi.string().required(),
  fetchedAt: Joi.string().required(),
  source: Joi.string().valid('finnhub', 'simulated').required(),
});

const schemas = {
  ORDER_CREATED: Joi.object({ orderId: Joi.string().required(), symbol: Joi.string().required(), side: Joi.string().required(), orderType: Joi.string().required(), quantity: Joi.number().required(), status: Joi.string().required() }),
  ORDER_PROCESSING: Joi.object({ orderId: Joi.string().required(), symbol: Joi.string().required() }),
  ORDER_FILLED: Joi.object({ orderId: Joi.string().required(), symbol: Joi.string().required(), side: Joi.string().required(), quantity: Joi.number().required(), executionPrice: Joi.string().required() }),
  ORDER_REJECTED: Joi.object({ orderId: Joi.string().required(), symbol: Joi.string().required(), reason: Joi.string().required() }),
  ORDER_CANCELLED: Joi.object({ orderId: Joi.string().required(), symbol: Joi.string().required(), reason: Joi.string().required() }),
  HOLDINGS_UPDATED: Joi.object({ symbol: Joi.string().required() }),
  BALANCE_UPDATED: Joi.object({ availableBalance: Joi.string().required(), reservedBalance: Joi.string().required() }),
  PORTFOLIO_UPDATED: Joi.object({}),
  MARKET_PRICE_UPDATE: Joi.object({ quotes: Joi.array().items(quote).required() }),
};

// Validates the payload and wraps it with an id + timestamp.
export function buildEvent(type, data) {
  const schema = schemas[type];
  if (!schema) throw new Error(`Unknown event type: ${type}`);
  const { value, error } = schema.validate(data, { stripUnknown: true });
  if (error) throw new Error(`Bad payload for ${type}: ${error.message}`);
  return { type, data: value, eventId: randomUUID(), timestamp: new Date().toISOString() };
}

// Private event: delivered ONLY to sockets belonging to this user.
export async function publishUserEvent(userId, type, data) {
  const event = buildEvent(type, data);
  await redis.publish(EVENTS_CHANNEL, JSON.stringify({ scope: 'user', userId: String(userId), event }));
}

// Market event: delivered to sockets in the "market" room.
export async function publishMarketEvent(quotes) {
  if (quotes.length === 0) return;
  const event = buildEvent('MARKET_PRICE_UPDATE', { quotes });
  await redis.publish(EVENTS_CHANNEL, JSON.stringify({ scope: 'market', event }));
}