// Exact decimal math for DISPLAY calculations (portfolio value, profit/loss).
// JavaScript floats are wrong for money (0.1 + 0.2 !== 0.3), so we use BigInt with 4 decimal places.
// The ledger itself (balances, holdings) is always calculated inside PostgreSQL with NUMERIC.
const SCALE = 10000n;

export function toScaled(value) {
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Not a decimal number: ${text}`);
  const negative = text.startsWith('-');
  const [whole, frac = ''] = text.replace('-', '').split('.');
  const fraction = (frac + '0000').slice(0, 4);
  const scaled = BigInt(whole) * SCALE + BigInt(fraction);
  return negative ? -scaled : scaled;
}

export function fromScaled(scaled) {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export const mulQty = (quantity, scaledPrice) => BigInt(quantity) * scaledPrice;

// Rounds UP (ceil) a scaled amount by percent: used for the market-buy reservation buffer.
export function addPercentCeil(scaled, percent) {
  const numerator = scaled * BigInt(Math.round(percent * 100) + 10000);
  return (numerator + 9999n) / 10000n;
}
