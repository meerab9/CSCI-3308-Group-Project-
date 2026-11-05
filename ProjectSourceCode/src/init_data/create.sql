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
