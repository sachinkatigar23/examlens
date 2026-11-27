import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askSchema } from '../../src/validators/ask.schemas.js';
import { uploadDocumentSchema } from '../../src/validators/document.schemas.js';
import { marksSchema, moveQuestionSchema } from '../../src/validators/question.schemas.js';

test('ask: defaults to Local mode and the Ask thread', () => {
  const parsed = askSchema.parse({ question: 'What is TCP?' });
  assert.equal(parsed.mode, 'local');
  assert.equal(parsed.thread, 'ask');
  assert.ok(!askSchema.safeParse({ question: 'x' }).success);
  assert.ok(!askSchema.safeParse({ question: 'What is TCP?', thread: 'other' }).success);
});

test('upload: papers need a year, notes keep their unit, "mixed" means no unit', () => {
  assert.ok(!uploadDocumentSchema.safeParse({ kind: 'paper' }).success);
  assert.equal(uploadDocumentSchema.parse({ kind: 'paper', year: '2024' }).year, 2024);
  assert.equal(uploadDocumentSchema.parse({ kind: 'notes', unit: 'Unit 2' }).unit, 'Unit 2');
  assert.equal(uploadDocumentSchema.parse({ kind: 'notes', unit: 'mixed' }).unit, null);
  // a year on notes and a unit on a syllabus are dropped, not stored
  assert.equal(uploadDocumentSchema.parse({ kind: 'notes', year: '2024' }).year, null);
  assert.equal(uploadDocumentSchema.parse({ kind: 'syllabus', unit: 'Unit 1' }).unit, null);
  assert.ok(!uploadDocumentSchema.safeParse({ kind: 'novel' }).success);
});

test('questions: topic must be an id or null; marks 1–30', () => {
  assert.ok(moveQuestionSchema.safeParse({ topicId: null }).success);
  assert.ok(moveQuestionSchema.safeParse({ topicId: '6b082106e1860cf4989c1ed9' }).success);
  assert.ok(!moveQuestionSchema.safeParse({ topicId: 'abc' }).success);
  assert.ok(marksSchema.safeParse({ marks: 16 }).success);
  assert.ok(!marksSchema.safeParse({ marks: 0 }).success);
  assert.ok(!marksSchema.safeParse({ marks: 99 }).success);
});
