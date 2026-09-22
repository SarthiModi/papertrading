// One virtual-cash account per user.
//   available_balance : cash the user can spend right now
//   reserved_balance  : cash locked by pending BUY orders
// CHECK constraints make a negative balance IMPOSSIBLE, even if application code has a bug.
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE user_accounts (
      user_id            BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      available_balance  NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
      reserved_balance   NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (reserved_balance  >= 0),
      updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE user_accounts;');
};
