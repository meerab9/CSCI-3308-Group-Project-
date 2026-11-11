// JSON API: auth (register/login/logout/me) + reading a public profile.
// Session-based, same as the page routes in index.js — just JSON instead
// of rendered HTML. Mounted at /api in index.js.

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { isValidUsername, isValidPassword, normalizeGithub, trimOrNull } = require('../lib/validators');
const validateRegistration = require('../validateRegistration');

const router = express.Router();
const LOOKING_FOR_OPTIONS = ['study', 'friends', 'both'];

const PUBLIC_FIELDS = `username, profile_picture, github, school, cs_interests,
                        other_interests, looking_for, created_at`;

// POST /api/auth/register  { username, password, github?, school?, cs_interests?,
//                             other_interests?, looking_for? }
router.post('/auth/register', async (req, res) => {
  const body = req.body || {};
  const username = (body.username || '').trim();

  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 characters: letters, numbers, _ . or -' });
  }
  if (!isValidPassword(body.password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const github = normalizeGithub(body.github);
  if (github === null) {
    return res.status(400).json({ error: 'GitHub must be a username or a github.com profile link.' });
  }
  // Final isolated-function gate before hashing (Lab 10 requirement), run
  // after the field-specific checks above so error messages stay precise.
  if (!validateRegistration({ username, password: body.password })) {
    return res.status(400).json({ error: 'Invalid registration input.' });
  }

  try {
    const hash = await bcrypt.hash(body.password, 10);
    await db.none(
      `INSERT INTO users (username, password, github, school, cs_interests, other_interests, looking_for)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        username,
        hash,
        github || null,
        trimOrNull(body.school),
        trimOrNull(body.cs_interests),
        trimOrNull(body.other_interests),
        LOOKING_FOR_OPTIONS.includes(body.looking_for) ? body.looking_for : 'both',
      ]
    );
    req.session.user = { username };
    req.session.save(() => res.status(201).json({ username }));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
    console.log(err);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

// POST /api/auth/login  { username, password }
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.oneOrNone('SELECT username, password FROM users WHERE username = $1;', [username]);
  const match = user && user.password && (await bcrypt.compare(password || '', user.password));

  if (!match) return res.status(401).json({ error: 'Incorrect username or password.' });

  req.session.user = { username: user.username };
  req.session.save(() => res.json({ username: user.username }));
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me
router.get('/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json(req.session.user);
});

// GET /api/users/:username  (public profile — no password hash)
router.get('/users/:username', async (req, res) => {
  const user = await db.oneOrNone(`SELECT ${PUBLIC_FIELDS} FROM users WHERE username = $1;`, [req.params.username]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const prompts = await db.any('SELECT prompt, answer FROM user_prompts WHERE username = $1;', [req.params.username]);
  res.json({ ...user, prompts });
});

module.exports = router;
