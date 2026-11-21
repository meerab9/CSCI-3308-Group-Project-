
const express = require('express');
const { db } = require('../db');

const router = express.Router();

// Require a logged-in user for all Discover endpoints.
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'You must be logged in.' });
    }

    next();
}

// Connection requests (send, accept, decline, remove) live in routes/connections.js,
// which app.js mounts before this file. The Connect button on the Discover page
// calls POST /api/connections/:username there.

// GET /api/discover
// Retrieves profiles for the Discover page.
router.get('/discover', requireLogin, async (req, res) => {
    try {
        const currentUsername = req.session.user.username;

        const profiles = await db.any(
            `
            SELECT
                u.username,
                u.full_name,
                u.profile_picture,
                u.github,
                u.school,
                u.major,
                u.location,
                u.bio,
                u.looking_for,

                COALESCE(
                    (
                        SELECT json_agg(s.skill_name ORDER BY s.skill_name)
                        FROM user_skills us
                        JOIN skills s ON us.skill_id = s.skill_id
                        WHERE us.username = u.username
                    ),
                    '[]'::json
                ) AS skills,

                COALESCE(
                    (
                        SELECT json_agg(i.interest_name ORDER BY i.interest_name)
                        FROM user_interests ui
                        JOIN interests i ON ui.interest_id = i.interest_id
                        WHERE ui.username = u.username
                    ),
                    '[]'::json
                ) AS interests,

                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'project_name', p.project_name,
                                'description', p.description,
                                'project_url', p.project_url,
                                'technologies', p.technologies
                            )
                            ORDER BY p.created_at DESC
                        )
                        FROM projects p
                        WHERE p.username = u.username
                    ),
                    '[]'::json
                ) AS projects

            FROM users u

            WHERE u.username <> $1

            AND NOT EXISTS (
                SELECT 1
                FROM connections c
                WHERE
                    (c.requester = $1 AND c.addressee = u.username)
                    OR
                    (c.requester = u.username AND c.addressee = $1)
            )

            ORDER BY u.created_at DESC;
            `,
            [currentUsername]
        );

        res.json(profiles);

    } catch (error) {
        console.error('Discover error:', error);
        res.status(500).json({ error: 'Unable to load Discover profiles.' });
    }
});

// GET /api/discover/:username
// Retrieves one profile and its related information.
router.get('/discover/:username', requireLogin, async (req, res) => {
    try {
        const profile = await db.oneOrNone(
            `
            SELECT
                username,
                full_name,
                profile_picture,
                github,
                school,
                major,
                location,
                bio,
                looking_for
            FROM users
            WHERE username = $1;
            `,
            [req.params.username]
        );

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        const skills = await db.any(
            `
            SELECT s.skill_name
            FROM user_skills us
            JOIN skills s ON us.skill_id = s.skill_id
            WHERE us.username = $1
            ORDER BY s.skill_name;
            `,
            [req.params.username]
        );

        const interests = await db.any(
            `
            SELECT i.interest_name
            FROM user_interests ui
            JOIN interests i ON ui.interest_id = i.interest_id
            WHERE ui.username = $1
            ORDER BY i.interest_name;
            `,
            [req.params.username]
        );

        const projects = await db.any(
            `
            SELECT project_name, description, project_url, technologies
            FROM projects
            WHERE username = $1
            ORDER BY created_at DESC;
            `,
            [req.params.username]
        );

        res.json({
            ...profile,
            skills: skills.map(s => s.skill_name),
            interests: interests.map(i => i.interest_name),
            projects
        });

    } catch (error) {
        console.error('Discover profile error:', error);
        res.status(500).json({ error: 'Unable to load profile.' });
    }
});

module.exports = router;
