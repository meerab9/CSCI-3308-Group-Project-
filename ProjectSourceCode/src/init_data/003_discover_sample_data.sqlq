-- ==========================================
-- GITMATCH DISCOVER SAMPLE DATA
-- ==========================================

-- Sample users
INSERT INTO users (
    username, full_name, bio, major, location,
    school, github, looking_for
)
VALUES
(
    'alex_dev',
    'Alex Morgan',
    'Computer science student interested in building useful applications.',
    'Computer Science',
    'Boulder, CO',
    'CU Boulder',
    'alexdev',
    'both'
),
(
    'jordan_codes',
    'Jordan Lee',
    'Interested in software engineering and collaborative projects.',
    'Computer Science',
    'Boulder, CO',
    'CU Boulder',
    'jordancode',
    'study'
),
(
    'sam_builds',
    'Sam Rivera',
    'Enjoys working on creative technology and engineering projects.',
    'Computer Science',
    'Denver, CO',
    'CU Boulder',
    'sambuilds',
    'friends'
)
ON CONFLICT (username) DO NOTHING;


-- Skills
INSERT INTO skills (skill_name)
VALUES
    ('Python'),
    ('JavaScript'),
    ('Java'),
    ('C++'),
    ('React'),
    ('SQL')
ON CONFLICT (skill_name) DO NOTHING;


-- Interests
INSERT INTO interests (interest_name)
VALUES
    ('Artificial Intelligence'),
    ('Web Development'),
    ('Robotics'),
    ('Data Science'),
    ('Mobile Apps')
ON CONFLICT (interest_name) DO NOTHING;


-- Connect users to skills
INSERT INTO user_skills (username, skill_id)
SELECT 'alex_dev', skill_id
FROM skills
WHERE skill_name IN ('Python', 'JavaScript', 'React')
ON CONFLICT DO NOTHING;

INSERT INTO user_skills (username, skill_id)
SELECT 'jordan_codes', skill_id
FROM skills
WHERE skill_name IN ('Java', 'SQL', 'Python')
ON CONFLICT DO NOTHING;

INSERT INTO user_skills (username, skill_id)
SELECT 'sam_builds', skill_id
FROM skills
WHERE skill_name IN ('C++', 'Python', 'JavaScript')
ON CONFLICT DO NOTHING;


-- Connect users to interests
INSERT INTO user_interests (username, interest_id)
SELECT 'alex_dev', interest_id
FROM interests
WHERE interest_name IN ('Artificial Intelligence', 'Web Development')
ON CONFLICT DO NOTHING;

INSERT INTO user_interests (username, interest_id)
SELECT 'jordan_codes', interest_id
FROM interests
WHERE interest_name IN ('Data Science', 'Web Development')
ON CONFLICT DO NOTHING;

INSERT INTO user_interests (username, interest_id)
SELECT 'sam_builds', interest_id
FROM interests
WHERE interest_name IN ('Robotics', 'Mobile Apps')
ON CONFLICT DO NOTHING;


-- Sample projects
INSERT INTO projects (
    username, project_name, description, project_url, technologies
)
SELECT
    'alex_dev',
    'Study Planner',
    'A web application for organizing study schedules.',
    'https://github.com/alexdev/study-planner',
    ARRAY['JavaScript', 'React', 'SQL']
WHERE NOT EXISTS (
    SELECT 1 FROM projects
    WHERE username = 'alex_dev'
      AND project_name = 'Study Planner'
);

INSERT INTO projects (
    username, project_name, description, project_url, technologies
)
SELECT
    'jordan_codes',
    'Data Dashboard',
    'A dashboard for exploring and visualizing datasets.',
    'https://github.com/jordancode/data-dashboard',
    ARRAY['Python', 'SQL']
WHERE NOT EXISTS (
    SELECT 1 FROM projects
    WHERE username = 'jordan_codes'
      AND project_name = 'Data Dashboard'
);

INSERT INTO projects (
    username, project_name, description, project_url, technologies
)
SELECT
    'sam_builds',
    'Robotics Controller',
    'A small project exploring robotics control systems.',
    'https://github.com/sambuilds/robotics-controller',
    ARRAY['C++', 'Python']
WHERE NOT EXISTS (
    SELECT 1 FROM projects
    WHERE username = 'sam_builds'
      AND project_name = 'Robotics Controller'
);
