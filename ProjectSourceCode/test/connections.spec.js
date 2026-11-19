// API integration tests for connection requests (src/routes/connections.js).
// Real logins, real Postgres rows; every fixture is deleted afterwards
// (ON DELETE CASCADE removes the users' connections and messages too), so the
// suite can run repeatedly. The shared pool is closed by the root after() hook
// in server.spec.js.

const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const app = require('../src/app');
const { db } = require('../src/db');

chai.use(chaiHttp);
const { expect } = chai;

describe('Connection requests API', () => {
  const tag = randomUUID().slice(0, 8);
  const password = 'TestPassword123!';
  const ana = `conn_ana_${tag}`;
  const ben = `conn_ben_${tag}`;
  const cam = `conn_cam_${tag}`;
  const everyone = [ana, ben, cam];
  const agents = {};

  async function loggedInAs(username) {
    const agent = chai.request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username, password });
    expect(res).to.have.status(200);
    return agent;
  }

  const connectionRows = (a, b) =>
    db.any(
      `SELECT requester, addressee, status, message FROM connections
        WHERE (requester = $1 AND addressee = $2) OR (requester = $2 AND addressee = $1)`,
      [a, b]
    );

  before(async () => {
    await db.none('DELETE FROM users WHERE username IN ($1:csv)', [everyone]);
    const hash = await bcrypt.hash(password, 10);
    for (const username of everyone) {
      await db.none('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
    }
    for (const username of everyone) agents[username] = await loggedInAs(username);
  });

  // Each test starts with nobody connected to anybody.
  afterEach(async () => {
    await db.none('DELETE FROM messages WHERE sender IN ($1:csv)', [everyone]);
    await db.none('DELETE FROM connections WHERE requester IN ($1:csv)', [everyone]);
  });

  after(async () => {
    Object.values(agents).forEach((a) => a.close());
    await db.none('DELETE FROM users WHERE username IN ($1:csv)', [everyone]);
  });

  it('rejects requests with no session (401)', async () => {
    const res = await chai.request(app).post(`/api/connections/${ben}`).send({ message: 'hi' });
    expect(res).to.have.status(401);
  });

  it('sends a request: saved as pending, shown to the recipient, messaging still blocked', async () => {
    const sendRes = await agents[ana].post(`/api/connections/${ben}`).send({ message: '  Want to study for 3308?  ' });
    expect(sendRes).to.have.status(201);
    expect(sendRes.body).to.deep.equal({ status: 'pending' });

    expect(await connectionRows(ana, ben)).to.deep.equal([
      { requester: ana, addressee: ben, status: 'pending', message: 'Want to study for 3308?' },
    ]);

    const inbox = await agents[ben].get('/api/connections/requests');
    expect(inbox).to.have.status(200);
    expect(inbox.body.requests).to.have.lengthOf(1);
    expect(inbox.body.requests[0]).to.include({ username: ana, message: 'Want to study for 3308?' });

    const msgRes = await agents[ana].post(`/api/messages/${ben}`).send({ body: 'hello?' });
    expect(msgRes).to.have.status(403);
  });

  it('accepting lets both people message, and the intro note opens the chat', async () => {
    await agents[ana].post(`/api/connections/${ben}`).send({ message: 'Want to study for 3308?' });

    const acceptRes = await agents[ben].post(`/api/connections/${ana}/accept`);
    expect(acceptRes).to.have.status(200);
    expect(acceptRes.body).to.deep.equal({ status: 'accepted' });

    const thread = await agents[ben].get(`/api/messages/${ana}`);
    expect(thread).to.have.status(200);
    expect(thread.body.messages.map((m) => [m.sender, m.body])).to.deep.equal([[ana, 'Want to study for 3308?']]);

    const reply = await agents[ben].post(`/api/messages/${ana}`).send({ body: 'Yes! Norlin at 6?' });
    expect(reply).to.have.status(201);

    const inbox = await agents[ben].get('/api/connections/requests');
    expect(inbox.body.requests).to.have.lengthOf(0);
  });

  it('declining hides the request, and the sender is never told', async () => {
    await agents[ana].post(`/api/connections/${ben}`).send({ message: 'hey!' });

    const declineRes = await agents[ben].post(`/api/connections/${ana}/decline`);
    expect(declineRes).to.have.status(200);
    expect((await agents[ben].get('/api/connections/requests')).body.requests).to.have.lengthOf(0);

    // Sender's view: still "pending", and asking again looks like it worked.
    const sent = await agents[ana].get('/api/connections/sent');
    expect(sent.body.sent.map((s) => [s.username, s.status])).to.deep.equal([[ben, 'pending']]);
    const again = await agents[ana].post(`/api/connections/${ben}`).send({ message: 'hey again' });
    expect(again).to.have.status(201);
    expect(again.body).to.deep.equal({ status: 'pending' });

    // ...but nothing actually changed, and messaging stays blocked.
    expect((await connectionRows(ana, ben)).map((r) => r.status)).to.deep.equal(['rejected']);
    expect((await agents[ana].post(`/api/messages/${ben}`).send({ body: 'hi' })).status).to.equal(403);
  });

  it('connects right away when both people request each other', async () => {
    await agents[ana].post(`/api/connections/${ben}`).send({ message: 'Want to pair program?' });
    const res = await agents[ben].post(`/api/connections/${ana}`).send({ message: 'Was about to ask you!' });

    expect(res).to.have.status(200);
    expect(res.body).to.deep.equal({ status: 'accepted' });
    const thread = await agents[ana].get(`/api/messages/${ben}`);
    expect(thread.body.messages.map((m) => m.body)).to.deep.equal(['Want to pair program?', 'Was about to ask you!']);
  });

  it('rejects bad requests: yourself (400), empty note (400), unknown user (404), duplicate (409)', async () => {
    const self = await agents[ana].post(`/api/connections/${ana}`).send({ message: 'me!' });
    const empty = await agents[ana].post(`/api/connections/${cam}`).send({ message: '   ' });
    const unknown = await agents[ana].post(`/api/connections/nobody_${tag}`).send({ message: 'hi' });
    await agents[ana].post(`/api/connections/${cam}`).send({ message: 'hi' });
    const duplicate = await agents[ana].post(`/api/connections/${cam}`).send({ message: 'hi again' });

    expect(self).to.have.status(400);
    expect(empty).to.have.status(400);
    expect(unknown).to.have.status(404);
    expect(duplicate).to.have.status(409);
    expect(await connectionRows(ana, cam)).to.have.lengthOf(1);
  });

  it("can't accept or decline a request that doesn't exist (404)", async () => {
    const accept = await agents[cam].post(`/api/connections/${ana}/accept`);
    const decline = await agents[cam].post(`/api/connections/${ana}/decline`);
    expect(accept).to.have.status(404);
    expect(decline).to.have.status(404);
  });
});
