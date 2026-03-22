'use strict';

/**
 * Validates a 5-field cron expression (minute hour dom month dow).
 * Rejects expressions that are too frequent (every minute) to prevent
 * excessive scheduling, and enforces strict field ranges.
 */

const FIELD_RANGES = [
  { name: 'minute',       min: 0,  max: 59 },
  { name: 'hour',         min: 0,  max: 23 },
  { name: 'day of month', min: 1,  max: 31 },
  { name: 'month',        min: 1,  max: 12 },
  { name: 'day of week',  min: 0,  max: 7  },
];

// Each field token must match: *, number, range, step, or list thereof
const TOKEN_RE = /^(\*|\d{1,2}(-\d{1,2})?)(\/(1?\d{1,2}))?$/;

function parseField(token, { min, max }) {
  if (token === '*') return true;

  const parts = token.split(',');
  for (const part of parts) {
    const m = TOKEN_RE.exec(part);
    if (!m) return false;

    const base = m[1];
    const step = m[4] !== undefined ? Number(m[4]) : null;

    if (step !== null && (step < 1 || step > max)) return false;

    if (base !== '*') {
      const rangeParts = base.split('-').map(Number);
      for (const n of rangeParts) {
        if (!Number.isInteger(n) || n < min || n > max) return false;
      }
      if (rangeParts.length === 2 && rangeParts[0] > rangeParts[1]) return false;
    }
  }
  return true;
}

function isValidCron(expr) {
  if (typeof expr !== 'string') return false;

  // Length guard — no legitimate cron expression exceeds 100 chars
  if (expr.length > 100) return false;

  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  for (let i = 0; i < 5; i++) {
    if (!parseField(fields[i], FIELD_RANGES[i])) return false;
  }

  // Reject "every minute" patterns — too frequent for user-facing scheduling
  if (fields[0] === '*' && !fields[0].includes('/')) {
    // minute field is bare * (every minute) — block it
    return false;
  }

  return true;
}

module.exports = { isValidCron };
