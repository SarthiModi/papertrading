export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id             BIGSERIAL PRIMARY KEY,
      name           VARCHAR(100)  NOT NULL,
      email          VARCHAR(255)  NOT NULL,
      password_hash  VARCHAR(255)  NOT NULL,
      created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
    -- Unique on lower(email) so "A@x.com" and "a@x.com" count as the same person.
    CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE users;');
};
