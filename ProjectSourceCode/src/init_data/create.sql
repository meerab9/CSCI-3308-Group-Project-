CREATE TABLE IF NOT EXISTS users (
  username            VARCHAR(50) PRIMARY KEY,
  password            CHAR(60),            -- NULL for Google/GitHub-only accounts
  profile_picture     VARCHAR(255),
  github              VARCHAR(100),
  school              VARCHAR(100),
  cs_interests        VARCHAR(500),
  other_interests     VARCHAR(500),
  looking_for         VARCHAR(10) NOT NULL DEFAULT 'both'
                        CHECK (looking_for IN ('study', 'friends', 'both')),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_prompts (
  prompt_id   SERIAL PRIMARY KEY,
  username    VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  prompt      VARCHAR(200) NOT NULL,
  answer      VARCHAR(500) NOT NULL
);

-- Links a user to a Google / GitHub account used for sign-in.
CREATE TABLE IF NOT EXISTS user_identities (
  provider     VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'github')),
  provider_id  VARCHAR(100) NOT NULL,
  username     VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  PRIMARY KEY (provider, provider_id)
);

-- A connection request from one user to another. Messaging is only allowed
-- between two users whose connection is 'accepted' (either direction).
-- The matching feature creates/updates these rows; messaging only reads them.
CREATE TABLE IF NOT EXISTS connections (
  requester    VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  addressee    VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  status       VARCHAR(10) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (requester, addressee),
  CHECK (requester <> addressee)
);

-- One-to-one chat messages between connected users.
CREATE TABLE IF NOT EXISTS messages (
  message_id   SERIAL PRIMARY KEY,
  sender       VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  recipient    VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  body         VARCHAR(2000) NOT NULL CHECK (length(trim(body)) > 0),
  sent_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (sender <> recipient)
);

CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (sender, recipient, message_id);
