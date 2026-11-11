// Single shared Postgres connection, used by the page routes, the JSON API,
// and the tests. Keeping this in one place means there's only ever one
// connection pool, and everything sees the same tables.
//
// Exports both `db` (for queries) and `pgp` (so tests can call pgp.end() to
// close the pool after the suite runs, instead of hiding open handles with
// mocha's --exit flag).

const pgp = require('pg-promise')();

const database = process.env.POSTGRES_DB;

// Guard rail: if NODE_ENV=test (set by docker-compose.test.yaml), refuse to
// run against anything that isn't an obviously-disposable test database.
if (process.env.NODE_ENV === 'test' && (!database || !database.endsWith('_test'))) {
  throw new Error('Tests require a database name ending in _test');
}

const db = pgp({
  host: process.env.POSTGRES_HOST || 'db', // 'db' matches the dev docker-compose service name
  port: Number(process.env.POSTGRES_PORT || 5432),
  database,
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

module.exports = { db, pgp };
