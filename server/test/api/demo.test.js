// Public demo mode (PUBLIC_DEMO=true): sign-ups closed, the shared demo account is read-only, and its
// sessions aren't tracked one by one. Each test file runs in its own process, so setting env here is safe.
process.env.PUBLIC_DEMO = 'true';
process.env.DEMO_EMAIL = 'demo@examlens.local';
process.env.DEMO_PASSWORD = 'examlens-demo';

const { after, before, test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { request, startApp, stopApp } = await import('../helpers.js');

const SERVICE = { 'X-Service-Key': 'test-service-key' }; // what the seed script sends
const DEMO = { email: 'demo@examlens.local', password: 'examlens-demo' };
let seedToken;
let spaceId;

before(async () => {
  await startApp();
  const res = await request('POST', '/auth/register', { body: { name: 'Demo Student', ...DEMO }, headers: SERVICE });
  assert.equal(res.status, 201);
  seedToken = res.body.accessToken;
  const space = await request('POST', '/spaces', { token: seedToken, headers: SERVICE, body: { name: 'CN' } });
  assert.equal(space.status, 201);
  spaceId = space.body.space._id;
});
after(stopApp);

const login = () => request('POST', '/auth/login', { body: DEMO });

test('/config tells the client it is the public demo', async () => {
  const res = await request('GET', '/config');
  assert.deepEqual(res.body, { publicDemo: true, registrationOpen: false, demoAccount: DEMO });
});

test('sign-ups are closed without the service key', async () => {
  const res = await request('POST', '/auth/register', {
    body: { name: 'Visitor', email: 'visitor@example.com', password: 'correct-horse-9' },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'REGISTRATION_CLOSED');
});

test('the demo account is read-only and defaults to Cloud', async () => {
  const { body } = await login();
  assert.equal(body.user.readOnly, true);
  assert.equal(body.user.settings.defaultMode, 'cloud');
  const token = body.accessToken;

  assert.equal((await request('GET', '/spaces', { token })).status, 200);
  assert.equal((await request('GET', `/spaces/${spaceId}/documents`, { token })).status, 200);

  const writes = [
    ['POST', '/spaces', { name: 'Mine' }],
    ['PATCH', `/spaces/${spaceId}`, { name: 'Renamed' }],
    ['DELETE', `/spaces/${spaceId}`],
    ['POST', `/spaces/${spaceId}/bank/answer-all`, { mode: 'local' }],
    ['DELETE', `/spaces/${spaceId}/messages`],
    ['PUT', `/spaces/${spaceId}/plan`, { examDate: '2027-01-01' }],
    ['PATCH', '/auth/me/settings', { defaultMode: 'local' }],
  ];
  for (const [method, url, b] of writes) {
    const res = await request(method, url, { token, body: b });
    assert.equal(res.status, 403, `${method} ${url}`);
    assert.equal(res.body.error.code, 'DEMO_READ_ONLY');
  }
});

test('the demo account may still Ask (reaches the AI service, which is down in tests)', async () => {
  const { body } = await login();
  const res = await request('POST', `/spaces/${spaceId}/ask`, { token: body.accessToken, body: { question: 'What is TCP?' } });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'AI_SERVICE_DOWN');
});

test('many visitors can be logged in at once (sessions are not capped at 5)', async () => {
  const sessions = [];
  for (let i = 0; i < 7; i++) sessions.push((await login()).cookie);
  for (const cookie of [sessions[0], sessions[6]]) {
    const res = await request('POST', '/auth/refresh', { cookie });
    assert.equal(res.status, 200);
  }
});
