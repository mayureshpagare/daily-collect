'use strict';
const crypto = require('crypto');
const { ValidationError } = require('./validation');

const KEYLEN = 32;

function validatePinFormat(pin) {
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    throw new ValidationError('PIN must be 4 to 8 digits.');
  }
}

function hashPin(pin) {
  validatePinFormat(pin);
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPin(pin, stored) {
  if (!stored || typeof pin !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/** Tracks failed unlock attempts: after 5 failures, waits grow 30s, 60s, 120s … (max 15 min). */
function createLockGuard() {
  let failures = 0;
  let lockedUntil = 0;
  return {
    check(now = Date.now()) {
      if (now < lockedUntil) {
        const secs = Math.ceil((lockedUntil - now) / 1000);
        throw new ValidationError(`Too many wrong attempts. Try again in ${secs} seconds.`);
      }
    },
    fail(now = Date.now()) {
      failures += 1;
      if (failures >= 5) {
        const wait = Math.min(30000 * 2 ** (failures - 5), 15 * 60000);
        lockedUntil = now + wait;
      }
      return failures;
    },
    reset() {
      failures = 0;
      lockedUntil = 0;
    },
  };
}

module.exports = { hashPin, verifyPin, validatePinFormat, createLockGuard };
