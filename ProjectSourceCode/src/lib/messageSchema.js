// Makes sure the messages table has the read_at column used for unread dots
// and "Seen" receipts.
//
// A brand-new database gets it from src/init_data/001_create.sql, but Postgres
// only runs those files the first time a volume is created. Anyone whose dev
// database already existed before read receipts were added would otherwise be
// missing the column, so this adds it on the first request instead (no need
// to run `docker compose down -v` and lose your data). Safe to run any number
// of times; if the database isn't up yet it simply tries again next request.

const { db } = require('../db');

let ready = null;

function ensureMessageSchema() {
  if (!ready) {
    ready = db
      .none(
        `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
         CREATE INDEX IF NOT EXISTS messages_unread_idx
           ON messages (recipient, sender) WHERE read_at IS NULL;`
      )
      .catch((err) => {
        ready = null; // try again on the next request
        throw err;
      });
  }
  return ready;
}

module.exports = { ensureMessageSchema };
