import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerUser, request, startApp, stopApp } from '../helpers.js';

before(startApp);
after(stopApp);

test('register returns a user without secrets, an access token and a refresh cookie', async () => {
  const res = await request('POST', '/auth/register', {
    body: { name: 'Asha', email: 'Asha@Example.com', password: 'correct-horse-9' },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.accessToken);
  assert.ok(res.cookie?.startsWith('refreshToken='));
  assert.equal(res.body.user.email, 'asha@example.com'); // stored lower-case
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal(res.body.user.refreshTokens, undefined);
});

test('register: same email twice is a conflict, bad input is a 400 with field details', async () => {
  const dup = await request('POST', '/auth/register', {
    body: { name: 'Asha', email: 'asha@example.com', password: 'correct-horse-9' },
  });
  assert.equal(dup.status, 409);
  const bad = await request('POST', '/auth/register', { body: { name: '', email: 'nope', password: '1' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  assert.ok(bad.body.error.details.length >= 2);
});

test('login: right password works, wrong password is 401', async () => {
  const ok = await request('POST', '/auth/login', { body: { email: 'asha@example.com', password: 'correct-horse-9' } });
  assert.equal(ok.status, 200);
  const wrong = await request('POST', '/auth/login', { body: { email: 'asha@example.com', password: 'wrong-pass-1' } });
  assert.equal(wrong.status, 401);
});

test('me needs a valid access token', async () => {
  const { token } = await registerUser();
  assert.equal((await request('GET', '/auth/me', { token })).status, 200);
  assert.equal((await request('GET', '/auth/me')).status, 401);
  assert.equal((await request('GET', '/auth/me', { token: 'not-a-jwt' })).status, 401);
});

test('refresh rotates the cookie, and reusing an old one logs the user out everywhere', async () => {
  const { cookie: first } = await registerUser();

  const r1 = await request('POST', '/auth/refresh', { cookie: first });
  assert.equal(r1.status, 200);
  assert.ok(r1.body.accessToken);
  assert.ok(r1.cookie && r1.cookie !== first, 'a new refresh cookie is issued');

  // The first cookie was already used: treated as stolen.
  const reused = await request('POST', '/auth/refresh', { cookie: first });
  assert.equal(reused.status, 401);
  assert.equal(reused.body.error.code, 'REFRESH_TOKEN_REUSED');

  // ...which also ended the newer session.
  const later = await request('POST', '/auth/refresh', { cookie: r1.cookie });
  assert.equal(later.status, 401);
});

test('logout revokes the refresh token', async () => {
  const { cookie } = await registerUser();
  assert.equal((await request('POST', '/auth/logout', { cookie })).status, 204);
  assert.equal((await request('POST', '/auth/refresh', { cookie })).status, 401);
  assert.equal((await request('POST', '/auth/refresh')).status, 401);
});
