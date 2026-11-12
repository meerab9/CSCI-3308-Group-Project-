// API integration tests for messaging (src/routes/messages.js).
// Real logins through POST /api/auth/login, real Postgres rows, and every
// fixture this file creates is deleted afterwards (ON DELETE CASCADE removes
// the test users' connections and messages too), so the suite can run
// repeatedly. The shared pool is closed by the root after() hook in
// server.spec.js.

const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const app = require('../src/app');
const { db } = require('../src/db');

chai.use(chaiHttp);
const { expect } = chai;

describe('Messaging API', () => {
  const tag = randomUUID().slice(0, 8);
  const password = 'TestPassword123!';
  const alice = `msg_alice_${tag}`; // connected with bob
  const bob = `msg_bob_${tag}`;
  const carol = `msg_carol_${tag}`; // NOT connected with alice (pending request only)
  const everyone = [alice, bob, carol];

  async function removeFixtures() {
    await db.none('DELETE FROM users WHERE username IN ($1:csv)', [everyone]);
  }

  async function loggedInAs(username) {
    const agent = chai.request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username, password });
    expect(res).to.have.status(200);
    return agent;
  }

  before(async () => {
    await removeFixtures();
    const hash = await bcrypt.hash(password, 10);
    for (const username of everyone) {
      await db.none('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
    }
    await db.none(
      `INSERT INTO connections (requester, addressee, status) VALUES
         ($1, $2, 'accepted'),
         ($1, $3, 'pending')`,
      [alice, bob, carol]
    );
  });

  afterEach(async () => {
    await db.none('DELETE FROM messages WHERE sender IN ($1:csv)', [everyone]);
  });

  after(removeFixtures);

  it('rejects messaging requests with no session (401)', async () => {
    const res = await chai.request(app).get('/api/conversations');
    expect(res).to.have.status(401);
    expect(res.body).to.have.property('error');
  });

  it('sends a message to a connection, saves it, and shows it to the recipient', async () => {
    const aliceAgent = await loggedInAs(alice);
    const sendRes = await aliceAgent.post(`/api/messages/${bob}`).send({ body: '  Want to study for the exam?  ' });
    aliceAgent.close();

    expect(sendRes).to.have.status(201);
    expect(sendRes.body.message).to.include({ sender: alice, recipient: bob, body: 'Want to study for the exam?' });

    const rows = await db.any('SELECT sender, recipient, body FROM messages WHERE sender = $1', [alice]);
    expect(rows).to.deep.equal([{ sender: alice, recipient: bob, body: 'Want to study for the exam?' }]);

    // Bob sees it in his thread with Alice and at the top of his conversation list.
    const bobAgent = await loggedInAs(bob);
    const threadRes = await bobAgent.get(`/api/messages/${alice}`);
    const listRes = await bobAgent.get('/api/conversations');
    bobAgent.close();

    expect(threadRes).to.have.status(200);
    expect(threadRes.body.messages.map((m) => m.body)).to.deep.equal(['Want to study for the exam?']);
    expect(listRes).to.have.status(200);
    expect(listRes.body.conversations[0]).to.include({
      username: alice,
      last_sender: alice,
      last_body: 'Want to study for the exam?',
    });
  });

  it('only returns newer messages when polling with ?after', async () => {
    const aliceAgent = await loggedInAs(alice);
    const first = await aliceAgent.post(`/api/messages/${bob}`).send({ body: 'first' });
    await aliceAgent.post(`/api/messages/${bob}`).send({ body: 'second' });

    const res = await aliceAgent.get(`/api/messages/${bob}?after=${first.body.message.message_id}`);
    aliceAgent.close();

    expect(res).to.have.status(200);
    expect(res.body.messages.map((m) => m.body)).to.deep.equal(['second']);
  });

  it('blocks messaging someone you are not connected with (403) and saves nothing', async () => {
    const aliceAgent = await loggedInAs(alice);
    const sendRes = await aliceAgent.post(`/api/messages/${carol}`).send({ body: 'hi carol' });
    const readRes = await aliceAgent.get(`/api/messages/${carol}`);
    aliceAgent.close();

    expect(sendRes).to.have.status(403);
    expect(readRes).to.have.status(403);
    const rows = await db.any('SELECT 1 FROM messages WHERE sender = $1 AND recipient = $2', [alice, carol]);
    expect(rows).to.have.lengthOf(0);
  });

  it('rejects an empty message (400) and saves nothing', async () => {
    const aliceAgent = await loggedInAs(alice);
    const res = await aliceAgent.post(`/api/messages/${bob}`).send({ body: '   ' });
    aliceAgent.close();

    expect(res).to.have.status(400);
    expect(res.body).to.have.property('error');
    const rows = await db.any('SELECT 1 FROM messages WHERE sender = $1', [alice]);
    expect(rows).to.have.lengthOf(0);
  });

  it('lists only accepted connections as people you can message', async () => {
    const aliceAgent = await loggedInAs(alice);
    const res = await aliceAgent.get('/api/connections');
    aliceAgent.close();

    expect(res).to.have.status(200);
    expect(res.body.connections.map((c) => c.username)).to.deep.equal([bob]);
  });
});
