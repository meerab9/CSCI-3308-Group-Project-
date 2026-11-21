// JSON API for one-to-one messaging between connected users.
// Mounted at /api in app.js, so the routes below are:
//
//   GET  /api/connections                people you can message (accepted connections)
//   GET  /api/conversations              sidebar list: one row per person you've messaged,
//                                        with how many of their messages you haven't read
//   GET  /api/messages/:username         the thread with one person (?after=<id> for new ones only),
//                                        plus `seen`: your latest message they've read
//   POST /api/messages/:username         send a message  { body: "..." }
//   POST /api/messages/:username/read    mark everything they've sent you as read
//
// Every route needs a signed-in session (401 otherwise). Reading, sending or
// marking a thread read also needs an ACCEPTED connection with that person
// (403 otherwise), so you can never message someone you haven't matched with.

const express = require('express');
const { db } = require('../db');
const { ensureMessageSchema } = require('../lib/messageSchema');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 2000;
const THREAD_LIMIT = 200; // most recent messages returned when opening a thread

// The "other person" in a connection or message, from the current user's side.
const OTHER_IN_CONNECTION = `CASE WHEN c.requester = $1 THEN c.addressee ELSE c.requester END`;

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Sign in to use messaging.' });
  }
  next();
}

// Adds messages.read_at to older dev databases (see lib/messageSchema.js).
async function schemaReady(req, res, next) {
  try {
    await ensureMessageSchema();
    next();
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Messaging is unavailable right now. Try again in a moment.' });
  }
}

const guard = [requireLogin, schemaReady];

async function areConnected(a, b) {
  const row = await db.oneOrNone(
    `SELECT 1 FROM connections
      WHERE status = 'accepted'
        AND ((requester = $1 AND addressee = $2) OR (requester = $2 AND addressee = $1))`,
    [a, b]
  );
  return Boolean(row);
}

// GET /api/connections
router.get('/connections', guard, async (req, res) => {
  const me = req.session.user.username;
  try {
    const connections = await db.any(
      `SELECT u.username, u.profile_picture, u.github, u.school
         FROM connections c
         JOIN users u ON u.username = ${OTHER_IN_CONNECTION}
        WHERE c.status = 'accepted' AND $1 IN (c.requester, c.addressee)
        ORDER BY u.username`,
      [me]
    );
    res.json({ connections });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load your connections.' });
  }
});

// GET /api/conversations
// Newest conversation first. Only includes people you're still connected with.
// unread_count = messages they sent you that you haven't opened yet.
router.get('/conversations', guard, async (req, res) => {
  const me = req.session.user.username;
  try {
    const conversations = await db.any(
      `WITH mine AS (
         SELECT m.*, CASE WHEN m.sender = $1 THEN m.recipient ELSE m.sender END AS other
           FROM messages m
          WHERE $1 IN (m.sender, m.recipient)
       ),
       latest AS (
         SELECT DISTINCT ON (other) other, message_id, sender, body, sent_at
           FROM mine
          ORDER BY other, message_id DESC
       ),
       unread AS (
         SELECT sender AS other, COUNT(*)::int AS n
           FROM messages
          WHERE recipient = $1 AND read_at IS NULL
          GROUP BY sender
       )
       SELECT l.other        AS username,
              u.profile_picture, u.github, u.school,
              l.message_id   AS last_message_id,
              l.sender       AS last_sender,
              l.body         AS last_body,
              l.sent_at      AS last_sent_at,
              COALESCE(un.n, 0) AS unread_count
         FROM latest l
         JOIN users u ON u.username = l.other
         LEFT JOIN unread un ON un.other = l.other
        WHERE EXISTS (
          SELECT 1 FROM connections c
           WHERE c.status = 'accepted'
             AND ((c.requester = $1 AND c.addressee = l.other)
               OR (c.requester = l.other AND c.addressee = $1))
        )
        ORDER BY l.sent_at DESC, l.message_id DESC`,
      [me]
    );
    res.json({ conversations });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load your conversations.' });
  }
});

// GET /api/messages/:username?after=<message_id>
// Without ?after, returns the most recent messages. With ?after, returns only
// messages newer than that id — this is what the page polls with.
//
// Always also returns `seen`: the newest message YOU sent that they have read
// ({ message_id, read_at }), or null. It's sent on every poll, so the "Seen"
// receipt updates even when no new messages arrive.
//
// Opening a thread does NOT mark it read by itself; the page calls
// POST /api/messages/:username/read for that, only while you're looking at it.
router.get('/messages/:username', guard, async (req, res) => {
  const me = req.session.user.username;
  const other = req.params.username;

  const after = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isInteger(after) || after < 0) {
    return res.status(400).json({ error: '"after" must be a non-negative whole number.' });
  }

  try {
    if (!(await areConnected(me, other))) {
      return res.status(403).json({ error: `You can only message people you're connected with.` });
    }

    const [messages, seen] = await Promise.all([
      db.any(
        `SELECT * FROM (
           SELECT message_id, sender, recipient, body, sent_at, read_at
             FROM messages
            WHERE ((sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1))
              AND message_id > $3
            ORDER BY message_id DESC
            LIMIT $4
         ) recent
         ORDER BY message_id ASC`,
        [me, other, after, THREAD_LIMIT]
      ),
      db.oneOrNone(
        `SELECT message_id, read_at
           FROM messages
          WHERE sender = $1 AND recipient = $2 AND read_at IS NOT NULL
          ORDER BY message_id DESC
          LIMIT 1`,
        [me, other]
      ),
    ]);
    res.json({ messages, seen });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load this conversation.' });
  }
});

// POST /api/messages/:username  { body }
router.post('/messages/:username', guard, async (req, res) => {
  const me = req.session.user.username;
  const other = req.params.username;
  const raw = (req.body || {}).body;
  const body = typeof raw === 'string' ? raw.trim() : '';

  if (!body) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
  }

  try {
    if (!(await areConnected(me, other))) {
      return res.status(403).json({ error: `You can only message people you're connected with.` });
    }

    const message = await db.one(
      `INSERT INTO messages (sender, recipient, body)
       VALUES ($1, $2, $3)
       RETURNING message_id, sender, recipient, body, sent_at, read_at`,
      [me, other, body]
    );
    res.status(201).json({ message });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not send your message.' });
  }
});

// POST /api/messages/:username/read
// Marks every unread message they sent you as read (this is what turns their
// receipt to "Seen"). Returns how many were marked.
router.post('/messages/:username/read', guard, async (req, res) => {
  const me = req.session.user.username;
  const other = req.params.username;
  try {
    if (!(await areConnected(me, other))) {
      return res.status(403).json({ error: `You can only message people you're connected with.` });
    }
    const result = await db.result(
      `UPDATE messages SET read_at = NOW()
        WHERE sender = $1 AND recipient = $2 AND read_at IS NULL`,
      [other, me]
    );
    res.json({ marked: result.rowCount });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not mark this conversation as read.' });
  }
});

module.exports = router;
