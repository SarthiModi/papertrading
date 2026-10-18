import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { config } from '../config/env.js';
import { COOKIE_NAME, verifyToken } from '../middleware/auth.js';
import { redis } from '../redis/client.js';
import { logger } from '../utils/logger.js';
import { EVENTS_CHANNEL } from './events.js';

const MAX_SOCKETS_PER_USER = 5;
const MARKET_ROOM = 'market';
const userRoom = (userId) => `user:${userId}`;

export function attachSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.frontendUrl, credentials: true },
    maxHttpBufferSize: 1024,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || origin === config.frontendUrl);
    },
  });

  // Authenticate every connection from the HttpOnly cookie.
  io.use((socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie || '')[COOKIE_NAME];
    const userId = token ? verifyToken(token) : null;
    if (!userId) return next(new Error('UNAUTHENTICATED'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', async (socket) => {
    const room = userRoom(socket.data.userId);
    socket.join(room);

    // Limit sockets per user: disconnect the oldest ones.
    const mine = await io.in(room).fetchSockets();
    if (mine.length > MAX_SOCKETS_PER_USER) {
      mine.slice(0, mine.length - MAX_SOCKETS_PER_USER).forEach((s) => s.disconnect(true));
    }

    socket.on('market:subscribe', () => socket.join(MARKET_ROOM));
    socket.on('market:unsubscribe', () => socket.leave(MARKET_ROOM));

    socket.emit('event', { type: 'CONNECTED', data: {}, timestamp: new Date().toISOString() });
  });

  // Redis Pub/Sub needs its own dedicated connection (a subscribed connection can't run normal commands).
  const subscriber = redis.duplicate();
  subscriber.subscribe(EVENTS_CHANNEL).catch((err) => logger.error('Socket.IO subscribe failed', { error: err.message }));
  subscriber.on('message', (channel, text) => {
    let envelope;
    try { envelope = JSON.parse(text); } catch { return; }
    if (envelope.scope === 'user') {
      io.to(userRoom(envelope.userId)).emit('event', envelope.event); // ONLY this user's sockets
    } else if (envelope.scope === 'market') {
      io.to(MARKET_ROOM).emit('event', envelope.event);
    }
  });

  return {
    io,
    stats: () => ({
      connections: io.engine.clientsCount,
      marketSubscribers: io.sockets.adapter.rooms.get(MARKET_ROOM)?.size || 0,
    }),
    async close() {
      subscriber.disconnect();
      await io.close(); // also closes the underlying HTTP server
    },
  };
}