import Joi from 'joi';
import { sendSuccess } from '../utils/apiResponse.js';
import { listStocks, getStock, getHistory } from '../services/stockService.js';

export const symbolParam = Joi.object({ symbol: Joi.string().uppercase().pattern(/^[A-Z.]{1,10}$/).required() });
export const listQuery = Joi.object({ q: Joi.string().trim().max(50).allow('') });
export const historyQuery = Joi.object({ limit: Joi.number().integer().min(1).max(500).default(100) });

export async function list(req, res) {
  sendSuccess(res, await listStocks(req.validated.query.q));
}
export async function detail(req, res) {
  sendSuccess(res, await getStock(req.validated.params.symbol));
}
export async function history(req, res) {
  sendSuccess(res, await getHistory(req.validated.params.symbol, req.validated.query.limit));
}