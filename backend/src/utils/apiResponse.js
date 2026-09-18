// Every API reply has the same shape, so the frontend can handle them uniformly.
//   success: { success: true,  data: ... }
//   failure: { success: false, error: { code, message } }

export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code; // short machine-readable text, e.g. "INSUFFICIENT_BALANCE"
  }
}

export function sendSuccess(res, data, statusCode = 200) {
  res.status(statusCode).json({ success: true, data });
}
