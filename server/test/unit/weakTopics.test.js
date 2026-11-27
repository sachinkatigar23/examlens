import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankWeakTopics } from '../../src/services/weakTopicService.js';

const topic = (id, name) => ({ _id: id, unit: 'Unit 1', name });
const stats = (paperYears, bankCount = 0, maxMarks = 0) => ({ paperYears, bankCount, maxMarks });

test('a topic never asked anywhere is not weak', () => {
  const out = rankWeakTopics([topic('a', 'Never asked')], new Map(), new Set(), new Map());
  assert.equal(out.length, 0);
});

test('asked often and not studied ranks above asked often but studied', () => {
  const topics = [topic('a', 'Studied'), topic('b', 'Not studied')];
  const s = new Map([['a', stats(3)], ['b', stats(3)]]);
  const out = rankWeakTopics(topics, s, new Set(['a']), new Map());
  assert.deepEqual(out.map((t) => t.name), ['Not studied', 'Studied']);
  assert.equal(out[1].weakness, out[0].weakness / 2); // studied without checks = half ready
});

test('check scores decide readiness, and 70% or more counts as ready', () => {
  const topics = [topic('a', 'Weak answers'), topic('b', 'Good answers')];
  const s = new Map([['a', stats(2)], ['b', stats(2)]]);
  const scores = new Map([['a', { checked: 2, percent: 40 }], ['b', { checked: 1, percent: 80 }]]);
  const out = rankWeakTopics(topics, s, new Set(), scores);
  assert.deepEqual(out.map((t) => t.name), ['Weak answers']);
  assert.equal(out[0].checkPercent, 40);
  assert.equal(out[0].weakness, 2.4); // priority 4 (2 × 2 years) × (1 − 0.4)
});

test('question bank alone (no past papers) still makes a topic important', () => {
  const out = rankWeakTopics([topic('a', 'Bank only')], new Map([['a', stats(0, 4, 10)]]), new Set(), new Map());
  assert.equal(out.length, 1);
  assert.equal(out[0].bankCount, 4);
});

test('the list is capped', () => {
  const topics = Array.from({ length: 10 }, (_, i) => topic(String(i), `T${i}`));
  const s = new Map(topics.map((t) => [t._id, stats(1)]));
  assert.equal(rankWeakTopics(topics, s, new Set(), new Map(), 3).length, 3);
});
