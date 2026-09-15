import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import stockRoutes from './routes/stockRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import portfolioRoutes from './routes/portfolioRoutes.js';
import watchlistRoutes from './routes/watchlistRoutes.js';
import systemRoutes from './routes/systemRoutes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  // credentials: true lets the browser send our HttpOnly auth cookie.
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}