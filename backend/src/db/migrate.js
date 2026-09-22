// Small wrapper around node-pg-migrate so it reads the SAME .env as the app.
// Usage:  npm run migrate:up     |     npm run migrate:down   (undoes the last migration)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { config } from '../config/env.js';

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const here = path.dirname(fileURLToPath(import.meta.url));

const migrated = await runner({
  databaseUrl: config.db,
  dir: path.join(here, 'migrations'),
  direction,
  count: direction === 'down' ? 1 : Infinity,
  migrationsTable: 'pgmigrations',
  log: () => {},
});

console.log(`Migrations ${direction}: ${migrated.map((m) => m.name).join(', ') || '(nothing to do)'}`);
