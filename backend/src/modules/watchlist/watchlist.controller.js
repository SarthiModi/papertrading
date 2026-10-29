// src/modules/watchlist/watchlist.controller.js

import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import * as watchlistService from "./watchlist.service.js";

const getWatchlist = asyncHandler(async (req, res) => {
  const list = await watchlistService.getWatchlist(req.user.id);
  res.status(200).json(new ApiResponse(200, "Watchlist fetched", list));
});

const addToWatchlist = asyncHandler(async (req, res) => {
  const stock = await watchlistService.addToWatchlist(req.user.id, req.body.symbol);
  res.status(201).json(new ApiResponse(201, "Added to watchlist", stock));
});

const removeFromWatchlist = asyncHandler(async (req, res) => {
  await watchlistService.removeFromWatchlist(req.user.id, req.params.stockId);
  res.status(200).json(new ApiResponse(200, "Removed from watchlist"));
});

// GET /api/watchlist/most-watched
// Returns top 5 most-added stocks across ALL users (LFU leaderboard).
const getMostWatched = asyncHandler(async (req, res) => {
  const limit  = Number(req.query.limit) || 5;
  const result = await watchlistService.getMostWatched(limit);
  res.status(200).json(new ApiResponse(200, "Most watched stocks", result));
});

export { getWatchlist, addToWatchlist, removeFromWatchlist, getMostWatched };
