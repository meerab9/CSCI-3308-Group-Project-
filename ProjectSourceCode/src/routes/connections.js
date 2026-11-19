// JSON API for connection requests: the "want to connect?" step that comes
// before two people can message each other. Mounted at /api in app.js:
//
//   POST /api/connections/:username            send a request  { message: "..." }
//   GET  /api/connections/requests             requests other people sent you (still waiting)
//   GET  /api/connections/sent                 requests you sent that are still waiting
//   POST /api/connections/:username/accept     accept their request -> you can now message
//   POST /api/connections/:username/decline    decline their request
//
// (GET /api/connections, the list of people you're already connected with,
//  lives in routes/messages.js because the messaging page uses it.)
//
// Privacy rule from our project proposal: the sender is never told that a
// request was declined. A declined request keeps looking "pending" to them,
// and sending it again quietly does nothing.

const express = require('express');
const { db } = require('../db');

const router = express.Router();

const MAX_INTRO_LENGTH = 300;

const PUBLIC_FIELDS = 'u.username, u.profile_picture, u.github, u.school';

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Sign in to manage connections.' });
  }
  next();
}

// The single row (if any) for a request sent from `from` to `to`.
function findRequest(t, from, to) {
  return t.oneOrNone(
    'SELECT status, message, created_at FROM connections WHERE requester = $1 AND addressee = $2',
    [from, to]
  );
}

// Accepting copies the intro note into the conversation, so the chat opens
// with the message that started it.
async function acceptRequest(t, requester, addressee) {
  const accepted = await t.oneOrNone(
    `UPDATE connections
        SET status = 'accepted', responded_at = NOW()
      WHERE requester = $1 AND addressee = $2 AND status = 'pending'
      RETURNING message, created_at`,
    [requester, addressee]
  );
  if (accepted && accepted.message) {
    await t.none(
      'INSERT INTO messages (sender, recipient, body, sent_at) VALUES ($1, $2, $3, $4)',
      [requester, addressee, accepted.message, accepted.created_at]
    );
  }
  return accepted;
}

// POST /api/connections/:username  { message }   (message is optional)
// The Discover page's Connect button sends no message; the Messages page's
// New Chat sends one as an intro note.
router.post('/connections/:username', requireLogin, async (req, res) => {
  const me = req.session.user.username;
  const other = req.params.username;
  const raw = (req.body || {}).message;
  const message = typeof raw === 'string' && raw.trim() ? raw.trim() : null;

  if (other === me) {
    return res.status(400).json({ error: "You can't send a connection request to yourself." });
  }
  if (message && message.length > MAX_INTRO_LENGTH) {
    return res.status(400).json({ error: `Keep your message to ${MAX_INTRO_LENGTH} characters or fewer.` });
  }

  try {
    const result = await db.tx(async (t) => {
      const exists = await t.oneOrNone('SELECT 1 FROM users WHERE username = $1', [other]);
      if (!exists) return { status: 404, body: { error: `No user named @${other}.` } };

      const mine = await findRequest(t, me, other);
      const theirs = await findRequest(t, other, me);

      if ((mine && mine.status === 'accepted') || (theirs && theirs.status === 'accepted')) {
        return { status: 409, body: { error: `You're already connected with @${other}.` } };
      }
      if (mine && mine.status === 'pending') {
        return { status: 409, body: { error: `You already sent @${other} a request.` } };
      }
      if (mine && mine.status === 'rejected') {
        // They declined before. Don't tell the sender; just do nothing.
        return { status: 201, body: { status: 'pending' } };
      }

      // They already asked to connect with you, so this is a match: accept it,
      // and add your note as the reply.
      if (theirs && theirs.status === 'pending') {
        await acceptRequest(t, other, me);
        if (message) {
          await t.none('INSERT INTO messages (sender, recipient, body) VALUES ($1, $2, $3)', [me, other, message]);
        }
        return { status: 200, body: { status: 'accepted' } };
      }

      await t.none(
        'INSERT INTO connections (requester, addressee, status, message) VALUES ($1, $2, $3, $4)',
        [me, other, 'pending', message]
      );
      return { status: 201, body: { status: 'pending' } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not send your request.' });
  }
});

// GET /api/connections/requests
router.get('/connections/requests', requireLogin, async (req, res) => {
  const me = req.session.user.username;
  try {
    const requests = await db.any(
      `SELECT ${PUBLIC_FIELDS}, c.message, c.created_at
         FROM connections c
         JOIN users u ON u.username = c.requester
        WHERE c.addressee = $1 AND c.status = 'pending'
        ORDER BY c.created_at DESC`,
      [me]
    );
    res.json({ requests });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load your requests.' });
  }
});

// GET /api/connections/sent
// Declined requests are reported as pending (see the privacy rule above).
router.get('/connections/sent', requireLogin, async (req, res) => {
  const me = req.session.user.username;
  try {
    const sent = await db.any(
      `SELECT ${PUBLIC_FIELDS}, c.message, c.created_at
         FROM connections c
         JOIN users u ON u.username = c.addressee
        WHERE c.requester = $1 AND c.status IN ('pending', 'rejected')
        ORDER BY c.created_at DESC`,
      [me]
    );
    res.json({ sent: sent.map((r) => ({ ...r, status: 'pending' })) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load your sent requests.' });
  }
});

// POST /api/connections/:username/accept
router.post('/connections/:username/accept', requireLogin, async (req, res) => {
  const me = req.session.user.username;
  const other = req.params.username;
  try {
    const accepted = await db.tx((t) => acceptRequest(t, other, me));
    if (!accepted) {
      return res.status(404).json({ error: `No pending request from @${other}.` });
    }
    res.json({ status: 'accepted' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not accept this request.' });
  }
});

// POST /api/connections/:username/decline
router.post('/connections/:username/decline', requireLogin, async (req, res) => {
  const me = req.session.user.username;
  const other = req.params.username;
  try {
    const declined = await db.oneOrNone(
      `UPDATE connections
          SET status = 'rejected', responded_at = NOW()
        WHERE requester = $1 AND addressee = $2 AND status = 'pending'
        RETURNING 1`,
      [other, me]
    );
    if (!declined) {
      return res.status(404).json({ error: `No pending request from @${other}.` });
    }
    res.json({ status: 'declined' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not decline this request.' });
  }
});

module.exports = router;
