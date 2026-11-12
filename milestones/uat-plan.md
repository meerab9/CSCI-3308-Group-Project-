# UAT Plan — GitMatch

## Scope

1. **Account creation & sign-in** — issues #4, #9, #10, #2 (registration page, registration backend, login backend/page). Implemented; covered by automated integration tests in `ProjectSourceCode/test/server.spec.js`.
2. **Messaging with a connection** — issues #3 (messaging UI) and #22 (messaging page). Implemented at `/messages` (page) and `/api/conversations`, `/api/messages/:username` (JSON), backed by the `connections` and `messages` tables; covered by automated integration tests in `ProjectSourceCode/test/messages.spec.js`. Creating connections from the UI depends on the matching feature; until then, testers can load `ProjectSourceCode/dev-seed/messaging-demo.sql` to get connected accounts.
3. **Profile editing** — issue #25 (user profile editing page, In Progress). Not yet implemented, users can currently only set these fields once, at registration.

## Acceptance criteria

| Feature | Acceptance criteria |
|---|---|
| Account creation & sign-in | A visitor can register with a unique username and a password of 8+ characters and is told the account was created. A visitor who omits a required field sees a message naming what's missing and no account is created. A registered user can sign in with the same credentials and reach a signed-in state, wrong credentials are rejected with a clear message and no session is created. |
| Messaging with a connection | A signed-in user can open a conversation with a user they're connected with and send a message that appears in the thread. A user cannot open a conversation with someone they are not connected with. |
| Profile editing | A signed-in user can change a profile field (e.g. school, CS interests, looking-for) and see the updated value on their own profile afterward. An edit that clears a required field is rejected with a clear message and the previous value is kept. |

## Environment

- Localhost, via `docker compose up` from the repository's `ProjectSourceCode/` directory (see root `README.md`).
- Browser: current Chrome, desktop.
- Application version: commit/branch to be recorded at execution time (not yet run — see Results below).

## Testers

- Intended users: CU Boulder CS students looking to meet people to study or be friends with which is the app's actual target audience, not the implementation team.
- Recruiting: each teammate asks 1–2 students outside the team to try their assigned feature, a teammate may act as a proxy tester only if no outside student is available, and that substitution is noted in the Issue/follow-up column when it happens.
- Planned tester IDs: T1, T2, T3 (assigned at execution time and IDs only, no names recorded).

## Test cases

| Test ID | Feature / requirement | Acceptance criterion | Preconditions | Test data | User steps | Expected result | Tester ID | Actual result | Status | Issue / follow-up |
|---|---|---|---|---|---|---|---|---|---|---|
| UAT-01 | Account creation (register) | Valid signup creates the account and confirms it | Registration page open; user signed out | Unique username `uat_demo1`; password `TestPass123!` | 1. Enter username. 2. Enter password + confirm. 3. Submit. | Account is created; page shows an "account created" confirmation. | Planned: T1 | Not run | Not run | None yet |
| UAT-02 | Sign-in (login) | Wrong credentials are rejected | An account already exists | That account's username + wrong password | 1. Go to sign-in. 2. Enter username + wrong password. 3. Submit. | Sign-in is rejected with a clear "incorrect username or password" message; no session created. | Planned: T2 | Not run | Not run | None yet |
| UAT-03 | Messaging | Signed-in user can message a connection | Two accounts exist and are connected; both signed in on separate sessions | A short text message | 1. Open conversation with the connection. 2. Type a message. 3. Send. | Message appears in the conversation thread for both users. | Planned: T3 | Not run | Not run | None yet |
| UAT-04 | Messaging | User cannot message a non-connection | Two accounts exist, not connected | — | 1. Attempt to open a conversation with the non-connection. | Access is blocked; user cannot view or send messages in that thread. | Planned: T3 | Not run | Not run | None yet |
| UAT-05 | Profile editing | Signed-in user can edit and save a profile field | Account exists and is signed in | New value for "CS interests" | 1. Open profile edit. 2. Change CS interests. 3. Save. | Profile page shows the updated value. | Planned: T1 | Not run | Not run | Feature not yet implemented (issue #25) |
| UAT-06 | Profile editing | Clearing a required field on edit is rejected | Account exists and is signed in | Blank value for a required field | 1. Open profile edit. 2. Clear the field. 3. Save. | Edit is rejected with a clear message; previous value is kept. | Planned: T1 | Not run | Not run | Feature not yet implemented (issue #25) |

## Results

All rows above are not run yet
