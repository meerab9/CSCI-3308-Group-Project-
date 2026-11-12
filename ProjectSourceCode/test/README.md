# Tests

Mocha + Chai (+ Chai HTTP for the API tests), run against an isolated
test database, never the dev or deployed one.

## Setup (once)

```
cp .env.test.example .env.test
```

`.env.test` is gitignored; everyone on the team makes their own copy.

## Running the tests

From `ProjectSourceCode/`:

```
docker compose -p gitmatch-tests -f docker-compose.test.yaml run --rm --no-deps tests npm ci
docker compose -p gitmatch-tests -f docker-compose.test.yaml up --abort-on-container-exit --exit-code-from tests
```

The first command installs dependencies into the test container's own
`node_modules` volume (only needed again if `package.json` changes). The
second actually runs the suite and exits with Mocha's exit code.

Shut the test containers down afterward (keeps the volumes, so the next
`npm ci` isn't wasted):

```
docker compose -p gitmatch-tests -f docker-compose.test.yaml down
```

To wipe the test database and dependencies and start clean:

```
docker compose -p gitmatch-tests -f docker-compose.test.yaml down --volumes
```

This only ever touches the disposable `gitmatch-tests` stack — it's a
separate Compose project from the normal dev stack (`docker compose up`),
which is untouched by any of this.

## What's tested

### Unit test — `test/validation.spec.js`

Calls `src/validateRegistration.js` directly. No HTTP, no database. That
function is also the last check both registration routes (`POST /register`
in `src/app.js` and `POST /api/auth/register` in `src/routes/api.js`) run
right before hashing the password and inserting the row — see the "Final
isolated-function gate" comment in each.

### API integration tests — `test/server.spec.js`

**Registration contract we're testing** (`POST /api/auth/register`, not
the HTML form at plain `/register`, which re-renders a page instead of
returning JSON):

| | |
|---|---|
| Endpoint | `POST /api/auth/register` |
| Request | JSON body: `{ "username": "...", "password": "..." }` |
| Valid username | Non-empty string after trimming |
| Valid password | String, at least 8 characters |
| Success | `201`, JSON body `{ "username": "..." }` |
| Invalid input | `400`, JSON body `{ "error": "..." }` |
| Persistence | One row in `users`; `password` column holds a bcrypt hash, never the plaintext |

- **Positive case:** registers a unique, randomly-generated username with
  a valid password. Asserts the `201` response, exactly one matching row,
  and that the stored password is a bcrypt hash that verifies against the
  original password.
- **Negative case:** submits a username with no password. Asserts the
  `400` response and that no row was inserted.
- **Welcome route** (`GET /welcome`) is a sanity check that the test
  harness can reach the app at all — it's not part of the registration
  contract.

### Cleanup

Both registration tests delete their own test usernames in `beforeEach`
and `afterEach`, so the suite is safe to run repeatedly (confirmed by
running it twice back to back — both runs passed 8/8). The database pool
is closed in an `after()` hook via `pgp.end()`, so Mocha exits cleanly on
its own, with no `--exit` flag needed.
