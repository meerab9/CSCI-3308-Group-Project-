// Shared validation rules, used by both the HTML form routes (index.js) and
// the JSON API (routes/api.js), so the two never disagree on what's valid.

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;

function isValidUsername(username) {
  return USERNAME_RE.test(username || '');
}

function isValidPassword(password) {
  return Boolean(password) && password.length >= 8;
}

// Accepts "octocat", "@octocat", or "https://github.com/octocat".
// Returns '' when blank, null when invalid, otherwise the bare username.
function normalizeGithub(value) {
  let v = (value || '').trim();
  if (!v) return '';
  v = v.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(v) ? v : null;
}

function trimOrNull(value) {
  const v = (value || '').trim();
  return v ? v : null;
}

module.exports = { isValidUsername, isValidPassword, normalizeGithub, trimOrNull };
