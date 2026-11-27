import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, isDate, priorityOf } from '../../src/services/planService.js';

test('priority: 2 per past-paper year + marks/5 + bank bonus', () => {
  assert.equal(priorityOf(undefined), 0);
  assert.equal(priorityOf({ paperYears: 3, maxMarks: 10, bankCount: 0 }), 8);
  assert.equal(priorityOf({ paperYears: 0, maxMarks: 5, bankCount: 2 }), 1 + 1 + 0.5);
  // the bank bonus stops growing after 6 questions
  assert.equal(priorityOf({ paperYears: 0, maxMarks: 0, bankCount: 20 }), 1 + 1.5);
});

test('dates are plain YYYY-MM-DD days', () => {
  assert.ok(isDate('2026-12-04'));
  assert.ok(!isDate('2026-13-01'));
  assert.ok(!isDate('04/12/2026'));
  assert.equal(daysBetween('2026-12-01', '2026-12-04'), 3);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});
