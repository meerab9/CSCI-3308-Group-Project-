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

### Messaging tests — `test/messages.spec.js`

Routes in `src/routes/messages.js`. Every route needs a signed-in session
(`401` otherwise); reading or sending a thread also needs an *accepted*
connection between the two users (`403` otherwise).

| Route | Success | Failure |
|---|---|---|
| `GET /api/connections` | `200` `{ connections: [...] }`, accepted connections only | `401` |
| `GET /api/conversations` | `200` `{ conversations: [...] }`, newest first, with each one's last message and `unread_count` | `401` |
| `GET /api/messages/:username?after=<id>` | `200` `{ messages: [...], seen }`, oldest first (each with `read_at`); with `after`, only newer ones. `seen` is your newest message they've read, or `null` | `401`, `403` not connected, `400` bad `after` |
| `POST /api/messages/:username` `{ "body": "..." }` | `201` `{ message: {...} }`, body trimmed | `401`, `403` not connected, `400` empty or over 2000 characters |
| `POST /api/messages/:username/read` | `200` `{ marked: n }`, marks their unread messages to you as read | `401`, `403` not connected |

Checks: no session → `401`; sending to a connection saves one row and the
recipient sees it; polling with `?after` returns only newer messages;
messaging a non-connection → `403` with nothing saved; empty message →
`400` with nothing saved; `/api/connections` lists accepted connections only;
messages count as unread for the recipient until they mark the chat read
(opening it alone doesn't), and then the sender gets `seen`, even on an
`?after` poll; marking a non-connection's chat read → `403`.

### Connection request tests — `test/connections.spec.js`

Routes in `src/routes/connections.js`. All need a signed-in session (`401`).
Privacy rule from our proposal: **the sender is never told a request was
declined.** It keeps looking pending to them, and sending again quietly
does nothing.

| Route | Success | Failure |
|---|---|---|
| `POST /api/connections/:username` `{ "message": "..." }` (message optional; the Discover page sends none) | `201` `{ status: "pending" }`; or `200` `{ status: "accepted" }` if they had already requested you | `400` yourself / note over 300 characters, `404` no such user, `409` already connected or already sent |
| `GET /api/connections/requests` | `200` `{ requests: [...] }`, pending requests sent to you, with their intro message | `401` |
| `GET /api/connections/sent` | `200` `{ sent: [...] }`, your requests still waiting (declined ones also show as pending) | `401` |
| `POST /api/connections/:username/accept` | `200` `{ status: "accepted" }`; their intro message becomes the first message in your chat | `404` no pending request from them |
| `POST /api/connections/:username/decline` | `200` `{ status: "declined" }` | `404` no pending request from them |
| `DELETE /api/connections/:username` | `200` `{ status: "removed" }`; messaging blocked both ways, chat hidden, history kept | `401`, `404` not connected (including only pending) |

Checks: no session → `401`; a request is saved as pending, shows up for
the recipient, and messaging stays blocked; accepting lets both people
message and the chat opens with the intro note; declining hides the
request while the sender still sees "pending" and can't tell; two people
requesting each other connect right away; a request with no note works
(Discover's Connect button); requesting yourself, a note over 300
characters, an unknown user, and a duplicate all fail; accepting or declining a
request that doesn't exist → `404`; removing a connection blocks messaging
both ways, hides the chat, keeps the messages, and lets either person
request again; removing a pending or nonexistent connection → `404`.

### Cleanup

The registration tests delete their own test usernames in `beforeEach`
and `afterEach`. The messaging and connection tests create their own
randomly named users and delete them at the end (`ON DELETE CASCADE`
removes their connections and messages too), clearing messages and
connections between tests. So the suite is safe to run repeatedly
(each test cleans up after itself). The database pool
is closed in an `after()` hook via `pgp.end()`, so Mocha exits cleanly on
its own, with no `--exit` flag needed.
