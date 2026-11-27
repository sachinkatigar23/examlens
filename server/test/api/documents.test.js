import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { minimalPdf, registerUser, request, startApp, stopApp } from '../helpers.js';

let user;
let spaceId;

before(async () => {
  await startApp();
  user = await registerUser();
  spaceId = (await request('POST', '/spaces', { token: user.token, body: { name: 'DBMS' } })).body.space._id;
});
after(stopApp);

function form(fields, file) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (file) f.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  return f;
}
const upload = (fields, file) =>
  request('POST', `/spaces/${spaceId}/documents`, { token: user.token, form: form(fields, file) });
const pdf = (name = 'notes.pdf') => ({ bytes: minimalPdf(), type: 'application/pdf', name });
const listDocuments = async () =>
  (await request('GET', `/spaces/${spaceId}/documents`, { token: user.token })).body.documents;

test('a PDF upload is accepted with 202 and queued', async () => {
  const res = await upload({ kind: 'notes', unit: 'Unit 1' }, pdf());
  assert.equal(res.status, 202);
  assert.equal(res.body.document.kind, 'notes');
  assert.equal(res.body.document.unit, 'Unit 1');
  assert.equal(res.body.document.status, 'queued');
});

test('with the AI service down, the document fails with a clear message (no hang, no crash)', async () => {
  let docs = [];
  for (let i = 0; i < 20; i++) {
    docs = await listDocuments();
    if (docs.every((d) => d.status === 'failed')) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(docs[0].status, 'failed');
  assert.match(docs[0].error, /AI service/i);
  assert.match(docs[0].error, /Retry/);

  // Retry is allowed for a failed document (it fails again, still cleanly).
  const retry = await request('POST', `/spaces/${spaceId}/documents/${docs[0]._id}/retry`, { token: user.token });
  assert.equal(retry.status, 202);
});

test('wrong files are rejected', async () => {
  const text = await upload({ kind: 'notes' }, { bytes: Buffer.from('hello'), type: 'text/plain', name: 'notes.txt' });
  assert.equal(text.status, 415);

  // Named .pdf with a PDF mimetype, but not a PDF inside.
  const fake = await upload(
    { kind: 'notes' },
    { bytes: Buffer.from('not really a pdf'), type: 'application/pdf', name: 'fake.pdf' },
  );
  assert.equal(fake.status, 415);

  const noFile = await upload({ kind: 'notes' });
  assert.equal(noFile.status, 400);
});

test('a past paper needs a year', async () => {
  const res = await upload({ kind: 'paper' }, pdf('paper.pdf'));
  assert.equal(res.status, 400);
  const ok = await upload({ kind: 'paper', year: '2024' }, pdf('paper.pdf'));
  assert.equal(ok.status, 202);
  assert.equal(ok.body.document.year, 2024);
});

test('delete removes the document (even with the AI service down)', async () => {
  const before = await listDocuments();
  const res = await request('DELETE', `/spaces/${spaceId}/documents/${before[0]._id}`, { token: user.token });
  assert.equal(res.status, 204);
  assert.equal((await listDocuments()).length, before.length - 1);
});

test('the internal callback route needs the service key', async () => {
  const res = await request('PATCH', '/internal/documents/000000000000000000000000', { body: { status: 'ready' } });
  assert.equal(res.status, 401);
});
