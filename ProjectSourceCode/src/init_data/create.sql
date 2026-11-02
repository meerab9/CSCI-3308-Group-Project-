CREATE TABLE IF NOT EXISTS users (
  username            VARCHAR(50) PRIMARY KEY,
  password            CHAR(60) NOT NULL,
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
