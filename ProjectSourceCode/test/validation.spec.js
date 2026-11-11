// Unit tests: call the validation function directly, no HTTP, no database.
// This is the function app.js and routes/api.js actually call before
// hashing/inserting on registration — see the "Final isolated-function
// gate" comment in each.

const { expect } = require('chai');
const validateRegistration = require('../src/validateRegistration');

describe('Registration validation', () => {
  it('rejects a missing password', () => {
    expect(validateRegistration({ username: 'student' })).to.equal(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(validateRegistration({ username: 'student', password: 'short1' })).to.equal(false);
  });

  it('rejects a username that is blank after trimming', () => {
    expect(validateRegistration({ username: '   ', password: 'password123' })).to.equal(false);
  });

  it('rejects missing input entirely', () => {
    expect(validateRegistration(undefined)).to.equal(false);
  });

  it('accepts a valid username and password', () => {
    expect(validateRegistration({ username: 'student', password: 'password123' })).to.equal(true);
  });
});
