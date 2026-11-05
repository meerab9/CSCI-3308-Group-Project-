// Single shared Postgres connection, used by both the page routes (index.js)
// and the JSON API (routes/api.js). Keeping this in one place means there's
// only ever one connection pool, and both layers see the same tables.

const pgp = require('pg-promise')();

const db = pgp({
  host: process.env.POSTGRES_HOST || 'db',
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

db.connect()
  .then(obj => {
    console.log('Database connection successful');
    obj.done();
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

module.exports = db;
