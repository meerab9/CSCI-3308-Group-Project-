
-- ==========================================
-- GITMATCH DISCOVER DATABASE EXPANSION
-- ==========================================

-- 1. Add additional profile information
-- Existing user records will remain valid.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS major VARCHAR(100);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS location VARCHAR(100);


-- 2. Create skills table

CREATE TABLE IF NOT EXISTS skills (
    skill_id SERIAL PRIMARY KEY,
    skill_name VARCHAR(100) UNIQUE NOT NULL
);


-- 3. Connect users to skills

CREATE TABLE IF NOT EXISTS user_skills (
    username VARCHAR(50) NOT NULL
        REFERENCES users(username) ON DELETE CASCADE,

    skill_id INTEGER NOT NULL
        REFERENCES skills(skill_id) ON DELETE CASCADE,

    PRIMARY KEY (username, skill_id)
);


-- 4. Create interests table

CREATE TABLE IF NOT EXISTS interests (
    interest_id SERIAL PRIMARY KEY,
    interest_name VARCHAR(100) UNIQUE NOT NULL
);


-- 5. Connect users to interests

CREATE TABLE IF NOT EXISTS user_interests (
    username VARCHAR(50) NOT NULL
        REFERENCES users(username) ON DELETE CASCADE,

    interest_id INTEGER NOT NULL
        REFERENCES interests(interest_id) ON DELETE CASCADE,

    PRIMARY KEY (username, interest_id)
);


-- 6. Create projects table

CREATE TABLE IF NOT EXISTS projects (
    project_id SERIAL PRIMARY KEY,

    username VARCHAR(50) NOT NULL
        REFERENCES users(username) ON DELETE CASCADE,

    project_name VARCHAR(150) NOT NULL,

    description TEXT,

    project_url TEXT,

    technologies TEXT[] NOT NULL DEFAULT '{}',

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);


-- 7. Add indexes for profile lookups

CREATE INDEX IF NOT EXISTS user_skills_skill_idx
ON user_skills(skill_id);

CREATE INDEX IF NOT EXISTS user_interests_interest_idx
ON user_interests(interest_id);

CREATE INDEX IF NOT EXISTS projects_username_idx
ON projects(username);
