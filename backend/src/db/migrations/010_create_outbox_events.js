// Transactional OUTBOX. The API inserts a row here in the SAME transaction that creates the order.
// A publisher later copies unpublished rows into the Redis queue. So an order can never exist
// without its queue job being (eventually) created, even if the server crashes right after COMMIT.
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE outbox_events (
      id            BIGSERIAL PRIMARY KEY,
      event_type    VARCHAR(50) NOT NULL,
      payload       JSONB       NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at  TIMESTAMPTZ
    );
    CREATE INDEX outbox_unpublished_idx ON outbox_events (id) WHERE published_at IS NULL;
  `);
};
export const down = (pgm) => {
  pgm.sql('DROP TABLE outbox_events;');
};
