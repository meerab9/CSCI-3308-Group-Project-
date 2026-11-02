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
  res.render('pages/home', { user: req.session.user });
});

app.get('/register', (req, res) => {
  res.render('pages/register', registerViewData());
});

app.post('/register', (req, res) => {
  // Run multer manually so upload errors render a message instead of crashing.
  upload.single('profile_picture')(req, res, async uploadErr => {
    const form = req.body || {};
    const fail = (message, status = 400) => {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(status).render('pages/register', registerViewData(form, message));
    };

    if (uploadErr) {
      const message =
        uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Profile picture must be 2 MB or smaller.'
          : uploadErr.message;
      return fail(message);
    }

    const username = (form.username || '').trim();
    const password = form.password || '';
    const github = normalizeGithub(form.github);
    const lookingFor = LOOKING_FOR_OPTIONS.includes(form.looking_for) ? form.looking_for : 'both';

    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
      return fail('Username must be 3-50 characters: letters, numbers, _ . or -');
    }
    if (password.length < 8) {
      return fail('Password must be at least 8 characters.');
    }
    if (password !== form.confirm_password) {
      return fail('Passwords do not match.');
    }
    if (github === null) {
      return fail('GitHub must be a username or a github.com profile link.');
    }

    // Pair up the chosen prompts with answers, skipping blank / invalid ones.
    const promptNames = [].concat(form.prompt || []);
    const promptAnswers = [].concat(form.prompt_answer || []);
    const prompts = promptNames
      .map((prompt, i) => ({ prompt, answer: (promptAnswers[i] || '').trim() }))
      .filter(p => PROFILE_PROMPTS.includes(p.prompt) && p.answer)
      .slice(0, MAX_PROMPTS);

    try {
      const hash = await bcrypt.hash(password, 10);
      const picturePath = req.file ? '/uploads/' + req.file.filename : null;

      await db.tx(async t => {
        await t.none(
          `INSERT INTO users
             (username, password, profile_picture, github, school,
              cs_interests, other_interests, looking_for)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [
            username,
            hash,
            picturePath,
            github || null,
            trimOrNull(form.school),
            trimOrNull(form.cs_interests),
            trimOrNull(form.other_interests),
            lookingFor,
          ]
        );
        for (const p of prompts) {
          await t.none(
            'INSERT INTO user_prompts (username, prompt, answer) VALUES ($1, $2, $3);',
            [username, p.prompt, p.answer]
          );
        }
      });

      res.render('pages/home', {
        message: `Account created! Welcome, ${username}. You can log in now.`,
      });
    } catch (err) {
      if (err.code === '23505') {
        return fail('That username is already taken.');
      }
      console.log(err);
      fail('Something went wrong creating your account. Please try again.', 500);
    }
  });
});

// *****************************************************
// <!-- Helpers -->
// *****************************************************

function registerViewData(form = {}, message) {
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
