// Legal order status changes. Anything else throws, so a bug can never move a filled order back to pending.
//
//   pending ──► processing ──► filled
//      │            │ └──────► rejected / failed
//      │            └────────► pending   (worker gave up for now, e.g. stale quote)
//      ├──► cancelled   (user cancel or expiry; ONLY allowed while pending)
//      └──► rejected / failed
//   filled, rejected, cancelled, failed are FINAL.
// ("partially_filled" exists in the DB for future use; v1 fills orders completely or not at all.)
import { ApiError } from '../utils/apiResponse.js';

export const TRANSITIONS = {
  pending: ['processing', 'cancelled', 'rejected', 'failed'],
  processing: ['filled', 'rejected', 'failed', 'pending'],
  partially_filled: [],
  filled: [],
  rejected: [],
  cancelled: [],
  failed: [],
};

export const OPEN_STATUSES = ['pending', 'processing'];

export function assertTransition(from, to) {
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) {
    throw new ApiError(409, 'INVALID_TRANSITION', `Order cannot change from "${from}" to "${to}"`);
  }
}
