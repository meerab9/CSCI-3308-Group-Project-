-- Demo data for trying out messaging locally, until the matching feature can
-- create connections from the UI. DEV DATABASE ONLY: this is deliberately not
-- in src/init_data, so it never runs against the test database.
--
-- 1. Register your own account in the app first (e.g. "wayne").
-- 2. From ProjectSourceCode/, with the dev stack running (docker compose up):
--
--      docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v me=wayne' < dev-seed/messaging-demo.sql
--
--    (replace "wayne" with your username)
-- 3. Open http://localhost:3000/messages
--
-- Demo accounts all use the password  Password123!  so you can also log in as
-- one of them in a private window and chat with yourself.
-- Safe to run more than once.

\set ON_ERROR_STOP on

INSERT INTO users (username, password, github, school) VALUES
  ('demo_ava',    '$2a$10$Au23bXcQBdlgaJG6hhd1WeRJnYvU5KqBUtJM7JiqkKD/V2EZWzlpm', 'octocat', 'CU Boulder'),
  ('demo_marcus', '$2a$10$Au23bXcQBdlgaJG6hhd1WeRJnYvU5KqBUtJM7JiqkKD/V2EZWzlpm', NULL,      'CU Boulder'),
  ('demo_priya',  '$2a$10$Au23bXcQBdlgaJG6hhd1WeRJnYvU5KqBUtJM7JiqkKD/V2EZWzlpm', NULL,      'CSU'),
  ('demo_stranger','$2a$10$Au23bXcQBdlgaJG6hhd1WeRJnYvU5KqBUtJM7JiqkKD/V2EZWzlpm', NULL,     NULL)
ON CONFLICT (username) DO NOTHING;

-- You're connected with ava, marcus and priya. demo_stranger only has a
-- pending request, so messaging them should be blocked (UAT-04).
INSERT INTO connections (requester, addressee, status) VALUES
  (:'me',          'demo_ava',      'accepted'),
  ('demo_marcus',  :'me',           'accepted'),
  (:'me',          'demo_priya',    'accepted'),
  (:'me',          'demo_stranger', 'pending')
ON CONFLICT (requester, addressee) DO NOTHING;

-- A couple of starter conversations (only added the first time).
INSERT INTO messages (sender, recipient, body, sent_at)
SELECT v.sender, v.recipient, v.body, NOW() - v.ago
  FROM (VALUES
    ('demo_marcus', :'me',          'Did you push the fix for the arg parser?',                                    INTERVAL '1 day 2 hours'),
    (:'me',         'demo_marcus',  'Just pushed it, check the dev branch',                                         INTERVAL '1 day 1 hour'),
    ('demo_ava',    :'me',          'Hey! Saw you know Python, want to help with the backend for my budget app?',  INTERVAL '50 minutes'),
    (:'me',         'demo_ava',     'Yeah that sounds sick. What stack are you using?',                             INTERVAL '47 minutes'),
    ('demo_ava',    :'me',          'Express + Postgres right now. Open to changing it though',                     INTERVAL '46 minutes')
  ) AS v(sender, recipient, body, ago)
 WHERE NOT EXISTS (
   SELECT 1 FROM messages m
    WHERE (m.sender = :'me' AND m.recipient IN ('demo_ava', 'demo_marcus'))
       OR (m.recipient = :'me' AND m.sender IN ('demo_ava', 'demo_marcus'))
 );
