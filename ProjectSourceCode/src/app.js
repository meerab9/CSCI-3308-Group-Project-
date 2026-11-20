// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const { db } = require('./db');
const { isValidUsername, isValidPassword, normalizeGithub, trimOrNull } = require('./lib/validators');
const validateRegistration = require('./validateRegistration');

// *****************************************************
// <!-- Section 2 : View Engine -->
// *****************************************************

const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
  helpers: {
    eq: (a, b) => a === b,
  },
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

// Count of connection requests waiting on the logged-in user, for the badge
// on the navbar's Messages button. Only runs for page loads, not API calls or
// static files, and never blocks a page if the query fails.
app.use(async (req, res, next) => {
  if (!req.session.user || req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/resources') || req.path.startsWith('/uploads')) {
    return next();
  }
  try {
    const row = await db.one(
      "SELECT COUNT(*)::int AS n FROM connections WHERE addressee = $1 AND status = 'pending'",
      [req.session.user.username]
    );
    res.locals.pendingRequests = row.n;
  } catch (err) {
    res.locals.pendingRequests = 0;
  }
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
// <!-- Section 4 : Routes -->
// *****************************************************

// Sanity-check route for the test harness (Lab 10): confirms Chai HTTP can
// reach the app at all, before any real route is tested.
app.get('/welcome', (req, res) => {
  res.json({ status: 'success', message: 'Welcome!' });
});

// JSON API (auth + profile reads) — see routes/api.js.
app.use('/api', require('./routes/api'));

// JSON API for connection requests (send, accept, decline) — see routes/connections.js.
// Mounted before discover so POST /api/connections/:username (used by both the
// Discover page's Connect button and the Messages page) is handled here.
app.use('/api', require('./routes/connections'));

// JSON API for Discover profiles.
app.use('/api', require('./routes/discover'));

// JSON API for messaging (conversations, threads, sending) — see routes/messages.js.
app.use('/api', require('./routes/messages'));

// Discover page
// Discover page
app.get('/discover', requireAuth, (req, res) => {
    res.render('pages/discover');
});
// Messaging page. The page itself is a shell; resources/js/messages.js loads
// conversations and threads from the /api messaging routes.
app.get('/messages', requireAuth, (req, res) => {
  res.render('pages/messages');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('pages/login', loginViewData());
});

app.post('/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const user = await db.oneOrNone('SELECT username, password FROM users WHERE username = $1;', [username]);
  // OAuth-only accounts have no password hash, so they can't log in this way.
  const match = user && user.password && (await bcrypt.compare(password, user.password));
  if (!match) {
    return res.status(401).render('pages/login', loginViewData({ username }, 'Incorrect username or password.'));
  }
  req.session.user = { username: user.username };
  req.session.save(() => res.redirect('/discover'));
});

app.get('/', (req, res) => {
  res.render('pages/home');
});

app.get('/register', (req, res) => {
  res.render('pages/register', registerViewData());
});

app.post('/register', withUpload, async (req, res) => {
  const form = req.body;

	      // Parse and clean structured skills
      const skills = [
        ...new Map(
          (form.skills || '')
            .split(',')
            .map(skill => skill.trim())
            .filter(skill => skill.length > 0 && skill.length <= 100)
            .map(skill => [skill.toLowerCase(), skill])
        ).values()
      ];

      // Parse and clean structured interests
      const structuredInterests = [
        ...new Map(
          (form.structured_interests || '')
            .split(',')
            .map(interest => interest.trim())
            .filter(interest => interest.length > 0 && interest.length <= 100)
            .map(interest => [interest.toLowerCase(), interest])
        ).values()
      ];



  const password = form.password || '';
  if (!isValidPassword(password)) {
    return failRegister(req, res, 'Password must be at least 8 characters.');
  }
  if (password !== form.confirm_password) {
    return failRegister(req, res, 'Passwords do not match.');
  }
  // Final isolated-function gate before hashing (Lab 10 requirement), run
  // after the field-specific checks above so error messages stay precise.
  if (!validateRegistration(form)) {
    return failRegister(req, res, 'Invalid registration input.');
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

//Jessica's routes for profile pages
//GET REQUEST FOR PROFILE PAGE
app.get('/profile', requireAuth, async (req, res) => {

  try {

    const username = req.session.user.username;


    const user = await db.oneOrNone(
      `
      SELECT
        username,
        full_name,
	bio,
	major,
	location,
	profile_picture,
        github,
        school,
        cs_interests,
        other_interests,
        looking_for,
        created_at

      FROM users

      WHERE username = $1;
      `,
      [username]
    );


    if (!user) {
      return res.status(404).send('User not found.');
    }

    // Load the user's saved skills
    const skills = await db.any(
      `
      SELECT s.skill_name
      FROM skills s
      JOIN user_skills us
        ON s.skill_id = us.skill_id
      WHERE us.username = $1
      ORDER BY s.skill_name;
      `,
      [username]
    );

    // Load the user's saved structured interests
    const structuredInterests = await db.any(
      `
      SELECT i.interest_name
      FROM interests i
      JOIN user_interests ui
        ON i.interest_id = ui.interest_id
      WHERE ui.username = $1
      ORDER BY i.interest_name;
      `,
      [username]
    );

    // Convert the results into comma-separated strings
    
    // Keep skills and interests as arrays for the profile page
    user.skills = skills.map(skill => skill.skill_name);

    user.structured_interests = structuredInterests.map(
      interest => interest.interest_name
    )
	.join(', ');

    // Load the user's saved projects
    const projects = await db.any(
  `
  SELECT
    project_id,
    project_name,
    description,
    project_url,
    technologies
  FROM projects
  WHERE username = $1
  ORDER BY created_at DESC;
  `,
  [username]
);

    const prompts = await db.any(
      `
      SELECT
        prompt_id,
        prompt,
        answer

      FROM user_prompts

      WHERE username = $1

      ORDER BY prompt_id;
      `,
      [username]
    );


    res.render('pages/profile', {
      user,
      prompts,
	projects
    });


  } catch (error) {

    console.log(error);

    res.status(500).send(
      'Unable to load profile.'
    );

  }

});

//GET REQUEST for profile EDIT page

app.get('/profile/edit', requireAuth, async (req, res) => {

  try {

    const username =
      req.session.user.username;


    const user = await db.one(
      `
      SELECT
    	username,
    	profile_picture,
    	full_name,
    	bio,
    	major,
    	location,
    	github,
    	school,
    	cs_interests,
    	other_interests,
    	looking_for

      FROM users

      WHERE username = $1;
      `,
      [username]
    );

	    // Load the user's saved skills
    const skills = await db.any(
      `
      SELECT s.skill_name
      FROM skills s
      JOIN user_skills us
        ON s.skill_id = us.skill_id
      WHERE us.username = $1
      ORDER BY s.skill_name;
      `,
      [username]
    );

    // Load the user's saved structured interests
    const structuredInterests = await db.any(
      `
      SELECT i.interest_name
      FROM interests i
      JOIN user_interests ui
        ON i.interest_id = ui.interest_id
      WHERE ui.username = $1
      ORDER BY i.interest_name;
      `,
      [username]
    );

    user.skills = skills
      .map(skill => skill.skill_name)
      .join(', ');

    user.structured_interests = structuredInterests
      .map(interest => interest.interest_name)
      .join(', ');

    // Load the user's saved projects
    const projects = await db.any(
      `
      SELECT
        project_id,
        project_name,
        description,
        project_url,
        technologies
      FROM projects
      WHERE username = $1
      ORDER BY created_at DESC;
      `,
      [username]
    );

// Format technologies for the edit form
projects.forEach(project => {
  project.technologies = (project.technologies || []).join(', ');
});
    
const prompts = await db.any(
      `
      SELECT
        prompt,
        answer

      FROM user_prompts

      WHERE username = $1

      ORDER BY prompt_id;
      `,
      [username]
    );


    const promptSlots = [];


    for (let i = 0; i < MAX_PROMPTS; i++) {

      promptSlots.push({

        index: i + 1,

        selected:
          prompts[i]?.prompt || '',

        answer:
          prompts[i]?.answer || '',

        options:
          PROFILE_PROMPTS

      });

    }


    res.render('pages/edit-profile', {
      user,
      promptSlots,
	projects
    });


  } catch (error) {

    console.log(error);

    res.status(500).send(
      'Unable to load profile.'
    );

  }

});

// POST REQUEST for profile EDIT page

app.post(
  '/profile/edit',

  requireAuth,

  withProfileUpload,

  async (req, res) => {

    const username =
      req.session.user.username;


    try {

      if (req.profileUploadError) {

        return res
          .status(400)
          .send(req.profileUploadError);

      }


      const form =
        req.body;

      // Parse and clean structured skills
      const skills = [
        ...new Map(
          (form.skills || '')
            .split(',')
            .map(skill => skill.trim())
            .filter(skill => skill.length > 0 && skill.length <= 100)
            .map(skill => [skill.toLowerCase(), skill])
        ).values()
      ];

      // Parse and clean structured interests
      const structuredInterests = [
        ...new Map(
          (form.structured_interests || '')
            .split(',')
            .map(interest => interest.trim())
            .filter(interest => interest.length > 0 && interest.length <= 100)
            .map(interest => [interest.toLowerCase(), interest])
        ).values()
      ];

// Collect submitted project fields
const projectNames = [].concat(form.project_name || []);
const projectDescriptions = [].concat(form.project_description || []);
const projectUrls = [].concat(form.project_url || []);
const projectTechnologies = [].concat(
  form.project_technologies || []
);

// Combine the submitted fields into project objects
const projects = projectNames
  .map((name, index) => ({
    project_name: (name || '').trim(),
    description: (projectDescriptions[index] || '').trim(),
    project_url: (projectUrls[index] || '').trim(),
    technologies: (projectTechnologies[index] || '')
      .split(',')
      .map(technology => technology.trim())
      .filter(technology => technology.length > 0)
  }))
  .filter(project =>
    project.project_name.length > 0 &&
    project.project_name.length <= 150
  );
      
const github =
        normalizeGithub(form.github);


      if (github === null) {

        if (req.file) {
          fs.unlink(
            req.file.path,
            () => {}
          );
        }

        return res
          .status(400)
          .send(
            'GitHub must be a username or a github.com profile link.'
          );

      }


      const lookingFor =
        LOOKING_FOR_OPTIONS.includes(
          form.looking_for
        )
          ? form.looking_for
          : 'both';


      const promptNames =
        [].concat(
          form.prompt || []
        );


      const promptAnswers =
        [].concat(
          form.prompt_answer || []
        );


      const prompts =
        promptNames

          .map((prompt, i) => ({

            prompt,

            answer:
              (
                promptAnswers[i] || ''
              ).trim()

          }))

          .filter(
            p =>
              PROFILE_PROMPTS.includes(
                p.prompt
              ) &&
              p.answer
          )

          .slice(
            0,
            MAX_PROMPTS
          );


      const currentUser =
        await db.one(
          `
          SELECT profile_picture

          FROM users

          WHERE username = $1;
          `,
          [username]
        );


      const newPicture =
        req.file
          ? '/uploads/' +
            req.file.filename
          : currentUser.profile_picture;


      await db.tx(
        async transaction => {


          await transaction.none(
            `
            UPDATE users

            SET
    		profile_picture = $1,
    		full_name = $2,
    		bio = $3,
    		major = $4,
    		location = $5,
    		github = $6,
    		school = $7,
    		cs_interests = $8,
    		other_interests = $9,
    		looking_for = $10

	WHERE username = $11;
            `,
            [
    newPicture,

    trimOrNull(form.full_name),
    trimOrNull(form.bio),
    trimOrNull(form.major),
    trimOrNull(form.location),

    github || null,
    trimOrNull(form.school),
    trimOrNull(form.cs_interests),
    trimOrNull(form.other_interests),

    lookingFor,
    username
]


          );

          // Replace the user's old skills
          await transaction.none(
            `
            DELETE FROM user_skills
            WHERE username = $1;
            `,
            [username]
          );

          // Save and link each skill
          for (const skill of skills) {
            const savedSkill = await transaction.one(
              `
              INSERT INTO skills (skill_name)
              VALUES ($1)
              ON CONFLICT (skill_name)
              DO UPDATE SET skill_name = EXCLUDED.skill_name
              RETURNING skill_id;
              `,
              [skill]
            );

            await transaction.none(
              `
              INSERT INTO user_skills (username, skill_id)
              VALUES ($1, $2);
              `,
              [username, savedSkill.skill_id]
            );
          }


          // Replace the user's old structured interests
          await transaction.none(
            `
            DELETE FROM user_interests
            WHERE username = $1;
            `,
            [username]
          );

          // Save and link each structured interest
          for (const interest of structuredInterests) {
            const savedInterest = await transaction.one(
              `
              INSERT INTO interests (interest_name)
              VALUES ($1)
              ON CONFLICT (interest_name)
              DO UPDATE SET interest_name = EXCLUDED.interest_name
              RETURNING interest_id;
              `,
              [interest]
            );

            await transaction.none(
              `
              INSERT INTO user_interests (username, interest_id)
              VALUES ($1, $2);
              `,
              [username, savedInterest.interest_id]
            );
          }
          
          // Replace the user's old projects
          await transaction.none(
            `
            DELETE FROM projects
            WHERE username = $1;
            `,
            [username]
          );

          // Save each submitted project
          for (const project of projects) {
            await transaction.none(
              `
              INSERT INTO projects (
                username,
                project_name,
                description,
                project_url,
                technologies
              )
              VALUES ($1, $2, $3, $4, $5);
              `,
              [
                username,
                project.project_name,
                project.description || null,
                project.project_url || null,
                project.technologies
              ]
            );
          }

// Replace the user's old prompts

          await transaction.none(
            `
            DELETE FROM user_prompts
            WHERE username = $1;
            `,
            [username]
          );


          for (const prompt of prompts) {

            await transaction.none(
              `
              INSERT INTO user_prompts
                (
                  username,
                  prompt,
                  answer
                )

              VALUES(
                $1,
                $2,
                $3
              );
              `,
              [
                username,
                prompt.prompt,
                prompt.answer
              ]
            );

          }

        }
      );


      // If they uploaded a new local image,
      // remove their old local image.

      if (
        req.file &&
        currentUser.profile_picture &&
        currentUser.profile_picture.startsWith(
          '/uploads/'
        )
      ) {

        const oldFile =
          path.join(
            UPLOAD_DIR,
            path.basename(
              currentUser.profile_picture
            )
          );


        fs.unlink(
          oldFile,
          () => {}
        );

      }


      res.redirect('/profile');


    } catch (error) {

      console.log(error);


      // If database update failed,
      // don't leave the newly uploaded
      // file sitting around.

      if (req.file) {

        fs.unlink(
          req.file.path,
          () => {}
        );

      }


      res.status(500).send(
        'Unable to update profile.'
      );

    }

  }
);



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

// Only allow logged-in users to access a route.
function requireAuth(req, res, next) {

  if (!req.session.user) {
    return res.redirect('/login');
  }

  next();
}

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

// Handles profile piocture uploads when editing a profile, if upload succeeds, continue to profile update route. 
// If fails, store the upload error so the edit page can display it.
function withProfileUpload(req, res, next) {

  upload.single('profile_picture')(req, res, err => {

    req.body = req.body || {};

    if (!err) {
      return next();
    }

    req.profileUploadError =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Profile picture must be 2 MB or smaller.'
        : err.message;

    next();

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

  if (!isValidUsername(username)) {
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
  res.render('pages/login', {
    ...loginViewData({ username }),
    message: `Account created! Welcome, ${username}. Log in to get started.`,
  });
}

function loginViewData(form = {}, message) {
  return {
    form,
    message,
    error: Boolean(message),
    googleEnabled: isConfigured(OAUTH_PROVIDERS.google),
    githubEnabled: isConfigured(OAUTH_PROVIDERS.github),
  };
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

// *****************************************************
// <!-- Section 5 : Export the configured app -->
// *****************************************************
// No app.listen() here — that happens once, in index.js. Chai HTTP starts
// this app on its own temporary port for each test and closes it after.

module.exports = app;
