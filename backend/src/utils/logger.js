// Tiny structured logger: one JSON object per line.
// Easy to read, easy to grep. Never pass passwords, tokens or API keys into it.
function write(level, message, fields = {}) {
  if (process.env.LOG_LEVEL === 'silent') return; // used by the test suite
  const line = { time: new Date().toISOString(), level, message, ...fields };
  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};
