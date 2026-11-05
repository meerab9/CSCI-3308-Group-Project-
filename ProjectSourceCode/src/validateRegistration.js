// Isolated registration validation: no HTTP, no database. Takes the
// candidate input and returns true only when it's shaped like something
// safe to hash and insert.
//
// This is deliberately looser than the full rules in lib/validators.js
// (which also checks username character set/length and GitHub format).
// It's the last, simple gate right before hashing/inserting in both
// registration routes — see app.js.

function validateRegistration(input) {
  return Boolean(
    input &&
      typeof input.username === 'string' &&
      input.username.trim().length > 0 &&
      typeof input.password === 'string' &&
      input.password.length >= 8
  );
}

module.exports = validateRegistration;
