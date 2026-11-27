// Shared setup for the API tests: a real Express app on a random port and a throwaway MongoDB database.
// No AI service and no Ollama: AI_SERVICE_URL points at a closed port, which is part of what's tested
// (uploads must fail with a clear message, not hang or crash).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'examlens-test-'));

// Set before the app is imported: config/env.js reads process.env once (dotenv never overrides these).
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGO_URI: process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/examlens_test',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  SERVICE_KEY: 'test-service-key',
  AI_SERVICE_URL: 'http://127.0.0.1:9', // nothing listens here
  UPLOAD_DIR: uploadDir,
  COOKIE_SECURE: 'false',
});

const mongoose = (await import('mongoose')).default;
const { createApp } = await import('../src/app.js');

let server;
let baseUrl;

export async function startApp() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await new Promise((resolve) => {
    server = createApp().listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
}

export async function stopApp() {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(uploadDir, { recursive: true, force: true });
}

// fetch wrapper: request(method, path, { token, body, form, cookie, headers }) → { status, body, cookie }
export async function request(method, url, { token, body, form, cookie, headers: extra } = {}) {
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(baseUrl + url, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  const setCookie = res.headers.get('set-cookie');
  return {
    status: res.status,
    body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text,
    // "refreshToken=abc; Path=...; HttpOnly" → "refreshToken=abc" (what a browser would send back)
    cookie: setCookie?.match(/refreshToken=[^;]*/)?.[0] ?? null,
  };
}

let userCount = 0;

// A fresh user with a unique email. Returns { token, cookie, user }.
export async function registerUser(name = 'Test Student') {
  userCount += 1;
  const res = await request('POST', '/auth/register', {
    body: { name, email: `student${userCount}-${Date.now()}@example.com`, password: 'correct-horse-9' },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, cookie: res.cookie, user: res.body.user };
}

// A tiny but real PDF with one line of text (PyMuPDF-free: written by hand).
export function minimalPdf(text = 'Unit 1 notes') {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((obj, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
