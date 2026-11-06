// src/modules/stocks/stocks.controller.js
// Thin HTTP layer — calls service, sends response.
// No business logic here.

import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import * as stocksService from "./stocks.service.js";

const getAllStocks = asyncHandler(async (req, res) => {
  const stocks = await stocksService.getAllStocks();
  res.status(200).json(new ApiResponse(200, "Stocks fetched", stocks));
});

const getStockBySymbol = asyncHandler(async (req, res) => {
  const stock = await stocksService.getStockBySymbol(req.params.symbol);
  res.status(200).json(new ApiResponse(200, "Stock fetched", stock));
});

const getTopTradedStocks = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5;
  const topStocks = await stocksService.getTopTradedStocks(limit);
  res.status(200).json(new ApiResponse(200, "Top traded stocks fetched", topStocks));
});

// GET /api/stocks/:stockId/candles?interval=60&limit=80
// interval = bucket size in seconds (60 = 1-min candles, 300 = 5-min candles)
// limit    = max number of candles to return
const getCandles = asyncHandler(async (req, res) => {
  const { stockId }     = req.params;
  const intervalSeconds = parseInt(req.query.interval, 10) || 60;
  const limit           = parseInt(req.query.limit,    10) || 80;

  console.log(`[Candles] stockId=${stockId} interval=${intervalSeconds}s limit=${limit}`);

  const candles = await stocksService.getCandles(stockId, intervalSeconds, limit);

  console.log(`[Candles] Returning ${candles.length} candles for ${stockId}`);
  res.status(200).json(new ApiResponse(200, "Candles fetched", candles));
});

export { getAllStocks, getStockBySymbol, getTopTradedStocks, getCandles };

