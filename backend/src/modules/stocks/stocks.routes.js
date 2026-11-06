// src/modules/stocks/stocks.routes.js
// Stocks are PUBLIC — no auth required to view the market.
// WHY? Just like Groww/Zerodha, you can browse prices before logging in.
// Auth is only needed when placing orders.

import { Router } from "express";
import * as stocksController from "./stocks.controller.js";

const router = Router();

// GET /api/stocks          — list all active stocks
router.get("/", stocksController.getAllStocks);

// GET /api/stocks/top-traded — top traded stocks by executed volume
router.get("/top-traded", stocksController.getTopTradedStocks);

// GET /api/stocks/:stockId/candles?interval=60&limit=80 — OHLC candlestick data
// IMPORTANT: must come BEFORE /:symbol to match correctly
router.get("/:stockId/candles", stocksController.getCandles);

// GET /api/stocks/:symbol  — single stock detail + price history
router.get("/:symbol", stocksController.getStockBySymbol);

export default router;

