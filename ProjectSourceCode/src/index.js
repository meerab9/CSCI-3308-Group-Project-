// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const path = require('path');
const fs = require('fs');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
  helpers: {
    eq: (a, b) => a === b,
  },
});

const dbConfig = {
  host: process.env.POSTGRES_HOST || 'db',
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};

const db = pgp(dbConfig);

db.connect()
  .then(obj => {
    console.log('Database connection successful');
    obj.done();
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

// Make the logged-in user available to every view (navbar etc).
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Only expose the static folders, not the whole src directory.
app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Profile picture uploads: images only, max 2 MB, saved to src/uploads.
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + ALLOWED_IMAGE_TYPES[file.mimetype]);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Profile picture must be a PNG, JPG, GIF, or WEBP image.'));
  },
});

// Prompts users can choose to answer on their profile.
const PROFILE_PROMPTS = [
  'My favorite programming language is ... because ...',
  'The project I am most proud of is ...',
  'A class I would love a study buddy for is ...',
  'My ideal study session looks like ...',
  'Outside of coding, you can find me ...',
  'A tech hot take I will defend is ...',
  'I am currently learning ...',
];
const MAX_PROMPTS = 3;
const LOOKING_FOR_OPTIONS = ['study', 'friends', 'both'];

// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************

app.get('/', (req, res) => {
  res.render('pages/home');
});

app.get('/register', (req, res) => {
  res.render('pages/register', registerViewData());
});

app.post('/register', withUpload, async (req, res) => {
  const form = req.body;
  const password = form.password || '';
  if (password.length < 8) {
    return failRegister(req, res, 'Password must be at least 8 characters.');
  }
  if (password !== form.confirm_password) {
    return failRegister(req, res, 'Passwords do not match.');
  }
  const hash = await bcrypt.hash(password, 10);
  await createUser(req, res, { passwordHash: hash });
});

// Finish signing up after a first-time Google/GitHub login.
app.get('/register/complete', (req, res) => {
  const pending = req.session.pendingOAuth;
  if (!pending) return res.redirect('/register');
  res.render('pages/register', registerViewData(pending.prefill, undefined, pending));
});

app.post('/register/complete', withUpload, async (req, res) => {
  const pending = req.session.pendingOAuth;
  if (!pending) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.redirect('/register');
  }
  await createUser(req, res, { identity: pending, fallbackPicture: pending.avatarUrl });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.render('pages/home', { user: null, message: 'Logged out.' });
  });
});

// *****************************************************
// <!-- OAuth (Google / GitHub) -->
// *****************************************************

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

const OAUTH_PROVIDERS = {
  google: {
    label: 'Google',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async fetchProfile(token) {
      const me = await getJson('https://openidconnect.googleapis.com/v1/userinfo', token);
      return {
        providerId: String(me.sub),
        suggestedUsername: (me.email || '').split('@')[0],
        avatarUrl: me.picture,
        github: '',
      };
    },
  },
  github: {
    label: 'GitHub',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user',
    async fetchProfile(token) {
      const me = await getJson('https://api.github.com/user', token);
      return {
        providerId: String(me.id),
        suggestedUsername: me.login,
        avatarUrl: me.avatar_url,
        github: me.login,
      };
    },
  },
};

const isConfigured = p => Boolean(p && p.clientId && p.clientSecret);

app.get('/auth/:provider', (req, res) => {
  const provider = OAUTH_PROVIDERS[req.params.provider];
  if (!provider) return res.status(404).send('Unknown provider');
  if (!isConfigured(provider)) {
    return res.status(503).render('pages/register', registerViewData({},
      `${provider.label} sign-in isn't set up yet (missing client ID/secret in .env).`));
  }

  // Random state value protects the callback against CSRF.
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: `${BASE_URL}/auth/${req.params.provider}/callback`,
    response_type: 'code',
    scope: provider.scope,
    state,
  });
  req.session.save(() => res.redirect(`${provider.authorizeUrl}?${params}`));
});

app.get('/auth/:provider/callback', async (req, res) => {
  const name = req.params.provider;
  const provider = OAUTH_PROVIDERS[name];
  if (!isConfigured(provider)) return res.status(404).send('Unknown provider');

  const expectedState = req.session.oauthState;
  delete req.session.oauthState;
  const oauthFail = message => res.status(400).render('pages/register', registerViewData({}, message));

  if (req.query.error) return oauthFail(`${provider.label} sign-in was cancelled.`);
  if (!req.query.code || !expectedState || req.query.state !== expectedState) {
    return oauthFail(`${provider.label} sign-in failed (invalid state). Please try again.`);
  }

  try {
    const tokenRes = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code: req.query.code,
        grant_type: 'authorization_code',
        redirect_uri: `${BASE_URL}/auth/${name}/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token: ' + JSON.stringify(tokenData));

    const profile = await provider.fetchProfile(tokenData.access_token);

    // Returning user -> log straight in.
    const existing = await db.oneOrNone(
      'SELECT username FROM user_identities WHERE provider = $1 AND provider_id = $2;',
      [name, profile.providerId]
    );
    if (existing) {
      req.session.user = { username: existing.username };
      return req.session.save(() => res.redirect('/'));
    }

    // New user -> finish profile on /register/complete.
    req.session.pendingOAuth = {
      provider: name,
      providerLabel: provider.label,
      providerId: profile.providerId,
      avatarUrl: profile.avatarUrl,
      prefill: {
        username: (profile.suggestedUsername || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 50),
        github: profile.github,
      },
    };
    req.session.save(() => res.redirect('/register/complete'));
  } catch (err) {
    console.log(err);
    oauthFail(`Couldn't sign in with ${provider.label}. Please try again.`);
  }
});

async function getJson(url, token) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'csci3308-app' },
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

// *****************************************************
// <!-- Helpers -->
// *****************************************************

// Runs multer so upload errors render a message instead of crashing.
function withUpload(req, res, next) {
  upload.single('profile_picture')(req, res, err => {
    req.body = req.body || {};
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Profile picture must be 2 MB or smaller.' : err.message;
    failRegister(req, res, message);
  });
}

// Re-render the right form (email or OAuth-complete) with an error.
function failRegister(req, res, message, status = 400) {
  if (req.file) fs.unlink(req.file.path, () => {});
  const pending = req.path === '/register/complete' ? req.session.pendingOAuth : undefined;
  res.status(status).render('pages/register', registerViewData(req.body, message, pending));
}

// Validates the shared profile fields and inserts the user (+ prompts, + OAuth identity).
async function createUser(req, res, { passwordHash = null, identity = null, fallbackPicture = null }) {
  const form = req.body;
  const username = (form.username || '').trim();
  const github = normalizeGithub(form.github);
  const lookingFor = LOOKING_FOR_OPTIONS.includes(form.looking_for) ? form.looking_for : 'both';

  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
    return failRegister(req, res, 'Username must be 3-50 characters: letters, numbers, _ . or -');
  }
  if (github === null) {
    return failRegister(req, res, 'GitHub must be a username or a github.com profile link.');
  }

  const promptNames = [].concat(form.prompt || []);
  const promptAnswers = [].concat(form.prompt_answer || []);
  const prompts = promptNames
    .map((prompt, i) => ({ prompt, answer: (promptAnswers[i] || '').trim() }))
    .filter(p => PROFILE_PROMPTS.includes(p.prompt) && p.answer)
    .slice(0, MAX_PROMPTS);

  const picture = req.file
    ? '/uploads/' + req.file.filename
    : fallbackPicture && /^https:\/\//.test(fallbackPicture) ? fallbackPicture : null;

  try {
    await db.tx(async t => {
      await t.none(
        `INSERT INTO users
           (username, password, profile_picture, github, school,
            cs_interests, other_interests, looking_for)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [username, passwordHash, picture, github || null, trimOrNull(form.school),
          trimOrNull(form.cs_interests), trimOrNull(form.other_interests), lookingFor]
      );
      for (const p of prompts) {
        await t.none('INSERT INTO user_prompts (username, prompt, answer) VALUES ($1, $2, $3);',
          [username, p.prompt, p.answer]);
      }
      if (identity) {
        await t.none(
          'INSERT INTO user_identities (provider, provider_id, username) VALUES ($1, $2, $3);',
          [identity.provider, identity.providerId, username]
        );
      }
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'users_pkey') {
      return failRegister(req, res, 'That username is already taken.');
    }
    if (err.code === '23505') {
      return failRegister(req, res, 'That account is already linked to another user.');
    }
    console.log(err);
    return failRegister(req, res, 'Something went wrong creating your account. Please try again.', 500);
  }

  if (identity) {
    // Social sign-up logs you straight in.
    delete req.session.pendingOAuth;
    req.session.user = { username };
    return req.session.save(() =>
      res.render('pages/home', { user: req.session.user, message: `Welcome, ${username}! Your profile is set up.` }));
  }
  res.render('pages/home', { message: `Account created! Welcome, ${username}. You can log in now.` });
}

function registerViewData(form = {}, message, pending) {
  const chosen = [].concat(form.prompt || []);
  const answers = [].concat(form.prompt_answer || []);
  const promptSlots = [];
  for (let i = 0; i < MAX_PROMPTS; i++) {
    promptSlots.push({
      index: i + 1,
      selected: chosen[i] || '',
      answer: answers[i] || '',
      options: PROFILE_PROMPTS,
    });
  }
  return {
    form,
    promptSlots,
    message,
    error: Boolean(message),
    lookingFor: form.looking_for || 'both',
    oauth: pending
      ? { providerLabel: pending.providerLabel, avatarUrl: pending.avatarUrl }
      : null,
    googleEnabled: isConfigured(OAUTH_PROVIDERS.google),
    githubEnabled: isConfigured(OAUTH_PROVIDERS.github),
  };
}

function trimOrNull(value) {
  const v = (value || '').trim();
  return v ? v : null;
}

// Accepts "octocat", "@octocat", or "https://github.com/octocat".
// Returns '' when blank, null when invalid, otherwise the bare username.
function normalizeGithub(value) {
  let v = (value || '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(v) ? v : null;
}

// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************

module.exports = app.listen(3000);
console.log('Server is listening on port 3000');
