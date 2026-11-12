const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../src/app');
const { db, pgp } = require('../src/db');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');

chai.use(chaiHttp);
const { expect } = chai;

after(() => {
  pgp.end();
});

describe('Welcome route', () => {
  it('returns the default welcome message', async () => {
    const res = await chai.request(app).get('/welcome');
    expect(res).to.have.status(200);
    expect(res.body).to.deep.equal({
      status: 'success',
      message: 'Welcome!',
    });
  });
});

// Our registration JSON API lives at POST /api/auth/register (see
// src/routes/api.js) rather than plain /register, which is the HTML form
// route and re-renders a page instead of returning JSON. See
// test/README.md for the full documented contract.
describe('POST /api/auth/register', () => {
  const validUser = {
    username: `lab10_${randomUUID()}`,
    password: 'TestPassword123!',
  };
  const invalidUser = {
    username: `lab10_${randomUUID()}`,
    // password intentionally omitted
  };

  async function removeTestUsers() {
    await db.none('DELETE FROM users WHERE username IN ($1, $2)', [
      validUser.username,
      invalidUser.username,
    ]);
  }

  beforeEach(removeTestUsers);
  afterEach(removeTestUsers);

  it('creates exactly one user for valid input', async () => {
    const res = await chai.request(app).post('/api/auth/register').send(validUser);

    // Assert: verify both the response and the saved record.
    expect(res).to.have.status(201);
    expect(res.body.username).to.equal(validUser.username);

    const rows = await db.any('SELECT username, password FROM users WHERE username = $1', [
      validUser.username,
    ]);
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].username).to.equal(validUser.username);
    expect(rows[0].password).not.to.equal(validUser.password);
    expect(await bcrypt.compare(validUser.password, rows[0].password)).to.equal(true);
  });

  it('rejects registration with a missing password and inserts nothing', async () => {
    const res = await chai.request(app).post('/api/auth/register').send(invalidUser);

    expect(res).to.have.status(400);
    expect(res.body).to.have.property('error');

    const rows = await db.any('SELECT username FROM users WHERE username = $1', [
      invalidUser.username,
    ]);
    expect(rows).to.have.lengthOf(0);
  });
});
