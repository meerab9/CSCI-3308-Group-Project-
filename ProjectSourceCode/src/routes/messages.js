// JSON API for one-to-one messaging between connected users.
// Mounted at /api in app.js, so the routes below are:
//
//   GET  /api/connections              people you can message (accepted connections)
//   GET  /api/conversations            sidebar list: one row per person you've messaged
//   GET  /api/messages/:username       the thread with one person (?after=<id> for new ones only)
//   POST /api/messages/:username       send a message  { body: "..." }
//
// Every route needs a signed-in session (401 otherwise). Reading or sending a
// thread also needs an ACCEPTED connection with that person (403 otherwise),
// so you can never message someone you haven't matched with.

const express = require('express');
const { db } = require('../db');

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
router.get('/connections', requireLogin, async (req, res) => {
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
router.get('/conversations', requireLogin, async (req, res) => {
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
       )
       SELECT l.other        AS username,
              u.profile_picture, u.github, u.school,
              l.message_id   AS last_message_id,
              l.sender       AS last_sender,
              l.body         AS last_body,
              l.sent_at      AS last_sent_at
         FROM latest l
         JOIN users u ON u.username = l.other
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
router.get('/messages/:username', requireLogin, async (req, res) => {
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

    const messages = await db.any(
      `SELECT * FROM (
         SELECT message_id, sender, recipient, body, sent_at
           FROM messages
          WHERE ((sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1))
            AND message_id > $3
          ORDER BY message_id DESC
          LIMIT $4
       ) recent
       ORDER BY message_id ASC`,
      [me, other, after, THREAD_LIMIT]
    );
    res.json({ messages });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load this conversation.' });
  }
});

// POST /api/messages/:username  { body }
router.post('/messages/:username', requireLogin, async (req, res) => {
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
       RETURNING message_id, sender, recipient, body, sent_at`,
      [me, other, body]
    );
    res.status(201).json({ message });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not send your message.' });
  }
});

module.exports = router;
