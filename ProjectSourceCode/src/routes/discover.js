
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

// POST /api/connections/:username
// Sends a connection request to another user.
router.post('/connections/:username', requireLogin, async (req, res) => {
    const currentUsername = req.session.user.username;
    const recipientUsername = req.params.username;

    // Prevent connecting with yourself.
    if (currentUsername === recipientUsername) {
        return res.status(400).json({
            error: 'You cannot send a connection request to yourself.'
        });
    }

    try {
        // Check that the recipient exists.
        const recipient = await db.oneOrNone(
            'SELECT username FROM users WHERE username = $1;',
            [recipientUsername]
        );

        if (!recipient) {
            return res.status(404).json({
                error: 'User not found.'
            });
        }

        // Check whether a request already exists in either direction.
        const existingOutgoing = await db.oneOrNone(
            `SELECT status FROM connections
             WHERE requester = $1 AND addressee = $2;`,
            [currentUsername, recipientUsername]
        );

        const existingIncoming = await db.oneOrNone(
            `SELECT status FROM connections
             WHERE requester = $1 AND addressee = $2;`,
            [recipientUsername, currentUsername]
        );

        if (existingOutgoing &&
            existingOutgoing.status !== 'rejected') {
            return res.status(409).json({
                error: 'You have already sent a connection request or are connected.'
            });
        }

        if (existingIncoming &&
            existingIncoming.status !== 'rejected') {
            return res.status(409).json({
                error: 'This user has already sent you a connection request.'
            });
        }

        // Insert a new request, or reactivate a previously rejected outgoing request.
        const connection = await db.one(
            `INSERT INTO connections (requester, addressee, status)
             VALUES ($1, $2, 'pending')
             ON CONFLICT (requester, addressee)
             DO UPDATE SET
                status = 'pending',
                created_at = NOW()
             WHERE connections.status = 'rejected'
             RETURNING requester, addressee, status, created_at;`,
            [currentUsername, recipientUsername]
        );

        res.status(201).json({
            message: 'Connection request sent.',
            connection
        });

    } catch (error) {
        console.error('Connection request error:', error);

        res.status(500).json({
            error: 'Unable to send connection request.'
        });
    }
});


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


/* ---------------- Incoming connection requests ---------------- */

// GET /api/connection-requests
// Returns pending requests sent TO the logged-in user.
router.get('/connection-requests', requireLogin, async (req, res) => {
    const currentUsername = req.session.user.username;

    try {
        const requests = await db.any(
            `SELECT
                u.username,
                u.full_name,
                u.profile_picture,
                u.school,
                u.major,
                c.created_at
             FROM connections c
             JOIN users u ON u.username = c.requester
             WHERE c.addressee = $1
               AND c.status = 'pending'
             ORDER BY c.created_at DESC;`,
            [currentUsername]
        );

        res.json({ requests });

    } catch (error) {
        console.error('Incoming requests error:', error);
        res.status(500).json({
            error: 'Unable to load connection requests.'
        });
    }
});


// POST /api/connection-requests/:username/accept
// Accepts a pending request sent by the specified user.
router.post('/connection-requests/:username/accept', requireLogin, async (req, res) => {
    const currentUsername = req.session.user.username;
    const requesterUsername = req.params.username;

    try {
        const connection = await db.oneOrNone(
            `UPDATE connections
             SET status = 'accepted'
             WHERE requester = $1
               AND addressee = $2
               AND status = 'pending'
             RETURNING requester, addressee, status;`,
            [requesterUsername, currentUsername]
        );

        if (!connection) {
            return res.status(404).json({
                error: 'Pending connection request not found.'
            });
        }

        res.json({
            message: 'Connection request accepted.',
            connection
        });

    } catch (error) {
        console.error('Accept request error:', error);
        res.status(500).json({
            error: 'Unable to accept connection request.'
        });
    }
});


// POST /api/connection-requests/:username/reject
// Rejects a pending request sent by the specified user.
router.post('/connection-requests/:username/reject', requireLogin, async (req, res) => {
    const currentUsername = req.session.user.username;
    const requesterUsername = req.params.username;

    try {
        const connection = await db.oneOrNone(
            `UPDATE connections
             SET status = 'rejected'
             WHERE requester = $1
               AND addressee = $2
               AND status = 'pending'
             RETURNING requester, addressee, status;`,
            [requesterUsername, currentUsername]
        );

        if (!connection) {
            return res.status(404).json({
                error: 'Pending connection request not found.'
            });
        }

        res.json({
            message: 'Connection request rejected.',
            connection
        });

    } catch (error) {
        console.error('Reject request error:', error);
        res.status(500).json({
            error: 'Unable to reject connection request.'
        });
    }
});


module.exports = router;
