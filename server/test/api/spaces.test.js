import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerUser, request, startApp, stopApp } from '../helpers.js';

let asha;
let ravi;
let spaceId;

before(async () => {
  await startApp();
  asha = await registerUser('Asha');
  ravi = await registerUser('Ravi');
});
after(stopApp);

test('create, list, rename and read a notebook', async () => {
  const created = await request('POST', '/spaces', {
    token: asha.token,
    body: { name: 'Computer Networks – Sem 3', subject: 'Computer Networks', color: '#2C6E7F' },
  });
  assert.equal(created.status, 201);
  spaceId = created.body.space._id;

  const list = await request('GET', '/spaces', { token: asha.token });
  assert.deepEqual(list.body.spaces.map((s) => s._id), [spaceId]);

  const renamed = await request('PATCH', `/spaces/${spaceId}`, { token: asha.token, body: { name: 'CN' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.space.name, 'CN');
});

test('a notebook needs a name', async () => {
  const res = await request('POST', '/spaces', { token: asha.token, body: { name: '' } });
  assert.equal(res.status, 400);
});

test('another user cannot see, change or use the notebook (404, not 403)', async () => {
  const routes = [
    ['GET', ''],
    ['PATCH', ''],
    ['DELETE', ''],
    ['GET', '/documents'],
    ['GET', '/analysis'],
    ['GET', '/bank'],
    ['GET', '/study'],
    ['GET', '/messages'],
    ['GET', '/checks'],
    ['GET', '/plan'],
  ];
  for (const [method, path] of routes) {
    const res = await request(method, `/spaces/${spaceId}${path}`, {
      token: ravi.token,
      body: method === 'PATCH' ? { name: 'mine now' } : undefined,
    });
    assert.equal(res.status, 404, `${method} ${path || '/'} should be 404 for another user`);
  }
  assert.deepEqual((await request('GET', '/spaces', { token: ravi.token })).body.spaces, []);
});

test('an empty notebook has an empty analysis and no weak topics', async () => {
  const res = await request('GET', `/spaces/${spaceId}/analysis`, { token: asha.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.paperCount, 0);
  assert.deepEqual(res.body.topics, []);
  assert.deepEqual(res.body.weakTopics, []);
});

test('invalid ids are 404, unknown routes are 404 JSON', async () => {
  assert.equal((await request('GET', '/spaces/not-an-id', { token: asha.token })).status, 404);
  const unknown = await request('GET', '/nope', { token: asha.token });
  assert.equal(unknown.status, 404);
  assert.ok(unknown.body.error.code);
});

test('delete a notebook', async () => {
  assert.equal((await request('DELETE', `/spaces/${spaceId}`, { token: asha.token })).status, 204);
  assert.equal((await request('GET', `/spaces/${spaceId}`, { token: asha.token })).status, 404);
});
