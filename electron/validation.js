'use strict';
const { isValidISODate } = require('./dates');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
  }
}

const MAX_AMOUNT = 1e10;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function cleanText(v, max = 500, field = 'Text') {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  if (s.length > max) throw new ValidationError(`${field} is too long (max ${max} characters).`);
  return s;
}

/** Strips spaces, dashes, dots and brackets so "98765 43210" and "98765-43210" are the same number. */
function normalizePhone(v) {
  if (isBlank(v)) return null;
  const cleaned = String(v).trim().replace(/[\s\-().]/g, '');
  if (!/^\+?\d{6,15}$/.test(cleaned)) {
    throw new ValidationError('Phone number must have 6–15 digits (a leading + is allowed).');
  }
  return cleaned;
}

function parseAmount(v, { field = 'Amount', allowZero = false } = {}) {
  if (isBlank(v)) throw new ValidationError(`${field} is required.`);
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number.`);
  if (n < 0) throw new ValidationError(`${field} cannot be negative.`);
  if (n === 0 && !allowZero) throw new ValidationError(`${field} must be greater than zero.`);
  if (n >= MAX_AMOUNT) throw new ValidationError(`${field} is too large.`);
  return round2(n);
}

function parseOptionalAmount(v, field) {
  if (isBlank(v)) return null;
  return parseAmount(v, { field, allowZero: true });
}

function parseDate(v, field = 'Date') {
  if (!isValidISODate(v)) throw new ValidationError(`${field} must be a valid date (YYYY-MM-DD).`);
  return v;
}

function parseOptionalDate(v, field) {
  if (isBlank(v)) return null;
  return parseDate(v, field);
}

function parseId(v, field = 'record') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${field} id.`);
  return n;
}

function validateCustomer(input = {}) {
  const name = cleanText(input.name, 100, 'Name');
  if (!name) throw new ValidationError('Customer name is required.');
  return {
    name,
    phone: normalizePhone(input.phone),
    address: cleanText(input.address, 300, 'Address'),
    notes: cleanText(input.notes, 1000, 'Notes'),
    start_date: parseOptionalDate(input.start_date, 'Start date'),
    daily_target: parseOptionalAmount(input.daily_target, 'Daily target'),
    active: input.active === undefined || input.active === null ? 1 : input.active ? 1 : 0,
  };
}

module.exports = {
  ValidationError,
  NotFoundError,
  round2,
  isBlank,
  cleanText,
  normalizePhone,
  parseAmount,
  parseOptionalAmount,
  parseDate,
  parseOptionalDate,
  parseId,
  validateCustomer,
};
