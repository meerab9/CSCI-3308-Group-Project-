// -------------------------------------
// Imports
// -------------------------------------

const express = require('express');
const handlebars = require('express-handlebars');
const path = require('path');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const app = express();


// -------------------------------------
// Handlebars
// -------------------------------------

const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: path.join(__dirname, 'views/layouts')
});

app.engine('hbs', hbs.engine);

app.set('view engine', 'hbs');

app.set(
  'views',
  path.join(__dirname, 'views')
);


// -------------------------------------
// Parse Form Data
// -------------------------------------

app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

app.use(bodyParser.json());


// -------------------------------------
// PostgreSQL
// -------------------------------------

const dbConfig = {

  host: 'db',

  port: 5432,

  database: process.env.POSTGRES_DB,

  user: process.env.POSTGRES_USER,

  password: process.env.POSTGRES_PASSWORD

};

const db = pgp(dbConfig);


// -------------------------------------
// Home
// -------------------------------------

app.get('/', (req, res) => {

  res.redirect('/register');

});


// -------------------------------------
// GET Register Page
// -------------------------------------

app.get('/register', (req, res) => {

  res.render('pages/register');

});


// -------------------------------------
// POST Register
// -------------------------------------

app.post('/register', async (req, res) => {

  const username = req.body.username;

  const password = req.body.password;


  try {

    // Hash the user's password
    const hash = await bcrypt.hash(
      password,
      10
    );


    // Insert user into PostgreSQL
    await db.none(
      `
      INSERT INTO users(username, password)
      VALUES($1, $2)
      `,
      [username, hash]
    );


    // Eventually this should go to login
    res.send('Account created successfully!');


  } catch (error) {

    console.log(error);


    res.render(
      'pages/register',
      {
        message:
          'That username may already be taken.'
      }
    );

  }

});


// -------------------------------------
// Start Server
// -------------------------------------

app.listen(3000, () => {

  console.log(
    'Git Match is running on port 3000'
  );

});