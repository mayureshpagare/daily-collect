'use strict';
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { openDatabase } = require('../electron/db');
const { createRepo } = require('../electron/repo');
const D = require('../electron/dates');

let dir;
let db;
let repo;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailycollect-test-'));
  db = openDatabase(path.join(dir, 'test.db'));
  repo = createRepo(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const rejects = (fn, re) => assert.throws(fn, (err) => err.code === 'VALIDATION' && re.test(err.message));

describe('schema', () => {
  test('foreign keys are enabled', () => {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  });

  test('indexes exist on collections.customer_id and collections.date', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'collections'").all().map((r) => r.name);
    assert.ok(idx.includes('idx_collections_customer_id'));
    assert.ok(idx.includes('idx_collections_date'));
  });

  test('collections FK is declared ON DELETE CASCADE', () => {
    const fk = db.prepare('PRAGMA foreign_key_list(collections)').all();
    assert.equal(fk[0].table, 'customers');
    assert.equal(fk[0].on_delete, 'CASCADE');
  });
});

describe('customers', () => {
  test('requires a name', () => {
    rejects(() => repo.createCustomer({ name: '   ' }), /name is required/i);
  });

  test('rejects duplicate phone numbers, even when formatted differently', () => {
    repo.createCustomer({ name: 'A', phone: '98765 43210' });
    rejects(() => repo.createCustomer({ name: 'B', phone: '98765-43210' }), /already used by "A"/);
  });

  test('allows several customers without a phone', () => {
    repo.createCustomer({ name: 'A' });
    repo.createCustomer({ name: 'B', phone: '' });
    assert.equal(repo.listCustomers().length, 2);
  });

  test('rejects a negative daily target', () => {
    rejects(() => repo.createCustomer({ name: 'A', daily_target: -5 }), /negative/);
  });

  test('update keeps phone uniqueness and records audit changes', () => {
    const a = repo.createCustomer({ name: 'A', phone: '1111111' });
    const b = repo.createCustomer({ name: 'B', phone: '2222222' });
    rejects(() => repo.updateCustomer(b.id, { name: 'B', phone: '1111111' }), /already used/);
    repo.updateCustomer(a.id, { name: 'A2', phone: '1111111', active: true });
    const log = repo.listAudit({ search: 'customer.update' }).rows[0];
    assert.deepEqual(JSON.parse(log.details).changes.name, { from: 'A', to: 'A2' });
  });

  test('imports customers from CSV rows and reports bad rows', () => {
    repo.createCustomer({ name: 'Existing', phone: '5555555' });
    const res = repo.importCustomers([
      { Name: 'New One', Phone: '1234567', daily_target: '100' },
      { Name: '', Phone: '7654321' },
      { Name: 'Dup', Phone: '555-5555' },
    ]);
    assert.equal(res.imported, 1);
    assert.equal(res.skipped.length, 2);
    assert.equal(res.skipped[0].line, 3);
  });
});

describe('collections', () => {
  let c;
  beforeEach(() => {
    c = repo.createCustomer({ name: 'Ramesh', phone: '9876543210', daily_target: 100 });
  });

  test('rejects empty, zero, negative and non-numeric amounts', () => {
    rejects(() => repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: '' }), /required/);
    rejects(() => repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: 0 }), /greater than zero/);
    rejects(() => repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: -10 }), /negative/);
    rejects(() => repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: 'abc' }), /number/);
    rejects(() => repo.addCollection({ customer_id: c.id, date: '2026-02-30', amount: 10 }), /valid date/);
  });

  test('accepts any varying amount and multiple entries per day', () => {
    repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: 120.5 });
    repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: '35' });
    repo.addCollection({ customer_id: c.id, date: '2026-01-02', amount: '1,250.255' });
    const entries = repo.entriesForDate('2026-01-01');
    assert.equal(entries.length, 2);
    const l = repo.getLedger(c.id);
    assert.equal(l.total, 1405.76);
  });

  test('bulk save is all-or-nothing', () => {
    const c2 = repo.createCustomer({ name: 'Suresh' });
    rejects(
      () => repo.addCollectionsBulk({ date: '2026-01-05', items: [{ customer_id: c.id, amount: 50 }, { customer_id: c2.id, amount: -1 }] }),
      /Nothing was saved/
    );
    assert.equal(repo.entriesForDate('2026-01-05').length, 0);
    const res = repo.addCollectionsBulk({ date: '2026-01-05', items: [{ customer_id: c.id, amount: 50 }, { customer_id: c2.id, amount: 70 }] });
    assert.deepEqual(res, { count: 2, total: 120 });
  });

  test('edit and delete write an audit trail with before/after values', () => {
    const e = repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: 100, note: 'cash' });
    repo.updateCollection(e.id, { amount: 150, note: 'cash + upi' });
    const upd = JSON.parse(repo.listAudit({ search: 'collection.update' }).rows[0].details);
    assert.equal(upd.before.amount, 100);
    assert.equal(upd.after.amount, 150);
    assert.deepEqual(upd.changed, ['amount', 'note']);
    repo.deleteCollection(e.id);
    const del = JSON.parse(repo.listAudit({ search: 'collection.delete' }).rows[0].details);
    assert.equal(del.amount, 150);
    assert.equal(repo.getLedger(c.id).count, 0);
  });

  test('ledger running total carries the balance from before the range', () => {
    repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: 100 });
    repo.addCollection({ customer_id: c.id, date: '2026-01-02', amount: 50 });
    repo.addCollection({ customer_id: c.id, date: '2026-01-03', amount: 25 });
    const l = repo.getLedger(c.id, { from: '2026-01-02', to: '2026-01-03' });
    assert.equal(l.opening, 100);
    assert.deepEqual(l.rows.map((r) => r.running_total), [150, 175]);
    assert.equal(l.total, 75);
    assert.equal(l.closing, 175);
  });
});

describe('cascade delete', () => {
  test('deleting a customer removes all their entries and nothing else', () => {
    const a = repo.createCustomer({ name: 'Delete Me' });
    const b = repo.createCustomer({ name: 'Keep Me' });
    for (let i = 1; i <= 5; i++) repo.addCollection({ customer_id: a.id, date: `2026-01-0${i}`, amount: i * 10 });
    repo.addCollection({ customer_id: b.id, date: '2026-01-01', amount: 99 });

    const preview = repo.deleteCustomerPreview(a.id);
    assert.equal(preview.entryCount, 5);
    assert.equal(preview.total, 150);

    const res = repo.deleteCustomer(a.id, 'Delete Me');
    assert.equal(res.deletedEntries, 5);
    assert.equal(res.deletedTotal, 150);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM collections WHERE customer_id = ?').get(a.id).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM collections').get().n, 1);
    assert.equal(repo.getLedger(b.id).total, 99);

    const log = JSON.parse(repo.listAudit({ search: 'customer.delete' }).rows[0].details);
    assert.equal(log.deleted_entries, 5);
  });

  test('requires the exact customer name to confirm', () => {
    const a = repo.createCustomer({ name: 'Ramesh' });
    repo.addCollection({ customer_id: a.id, date: '2026-01-01', amount: 10 });
    rejects(() => repo.deleteCustomer(a.id, 'ramesh x'), /does not match/);
    assert.equal(repo.getLedger(a.id).count, 1);
  });

  test('the database itself cascades (raw SQL delete)', () => {
    const a = repo.createCustomer({ name: 'Raw' });
    repo.addCollection({ customer_id: a.id, date: '2026-01-01', amount: 10 });
    db.prepare('DELETE FROM customers WHERE id = ?').run(a.id);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM collections').get().n, 0);
  });
});

describe('dashboard, missed days, closing', () => {
  test('dashboard counts paid and not-paid customers for today', () => {
    const today = '2026-03-10';
    const a = repo.createCustomer({ name: 'A' });
    repo.createCustomer({ name: 'B' });
    repo.addCollection({ customer_id: a.id, date: today, amount: 40 });
    repo.addCollection({ customer_id: a.id, date: today, amount: 60 });
    repo.addCollection({ customer_id: a.id, date: '2026-03-01', amount: 10 });
    const d = repo.getDashboard(today);
    assert.equal(d.todayTotal, 100);
    assert.equal(d.monthTotal, 110);
    assert.equal(d.paidToday, 1);
    assert.equal(d.notPaidToday, 1);
    assert.equal(d.last30.length, 30);
    assert.equal(d.forecast.points.length, 7);
    assert.equal(d.topCollectors[0].name, 'A');
  });

  test('missed tracker counts days without payment', () => {
    const today = '2026-03-10';
    const a = repo.createCustomer({ name: 'Paid today' });
    const b = repo.createCustomer({ name: 'Skipped 4' });
    const c = repo.createCustomer({ name: 'Never', start_date: '2026-03-08' });
    repo.addCollection({ customer_id: a.id, date: today, amount: 5 });
    repo.addCollection({ customer_id: b.id, date: '2026-03-06', amount: 5 });
    const m = Object.fromEntries(repo.getMissed(today).map((r) => [r.id, r]));
    assert.equal(m[a.id].paidToday, true);
    assert.equal(m[a.id].daysWithout, 0);
    assert.equal(m[b.id].daysWithout, 4);
    assert.equal(m[c.id].neverPaid, true);
    assert.equal(m[c.id].daysWithout, 3);
  });

  test('day closing computes the cash difference', () => {
    const a = repo.createCustomer({ name: 'A' });
    repo.addCollection({ customer_id: a.id, date: '2026-03-10', amount: 500 });
    const short = repo.saveDayClosing({ date: '2026-03-10', counted: 450 });
    assert.equal(short.difference, -50);
    const exact = repo.saveDayClosing({ date: '2026-03-10', counted: '500' });
    assert.equal(exact.difference, 0);
    assert.equal(repo.listDayClosings().length, 1);
  });
});

describe('settings', () => {
  test('validates and persists settings', () => {
    const s = repo.setSettings({ currency_symbol: '$', locale: 'en-US', theme: 'dark', missed_threshold: 5 });
    assert.equal(s.currency_symbol, '$');
    assert.equal(s.missed_threshold, 5);
    rejects(() => repo.setSettings({ theme: 'pink' }), /Theme/);
    rejects(() => repo.setSettings({ missed_threshold: 0 }), /between 1 and 365/);
  });

  test('never exposes the PIN hash', () => {
    repo.setRawSetting('pin_hash', 'scrypt$aa$bb');
    const s = repo.getSettings();
    assert.equal(s.hasPin, true);
    assert.equal(s.pin_hash, undefined);
  });
});

describe('dates', () => {
  test('date arithmetic is DST-safe', () => {
    assert.equal(D.addDays('2026-03-28', 2), '2026-03-30');
    assert.equal(D.diffDays('2026-01-01', '2027-01-01'), 365);
    assert.equal(D.isValidISODate('2026-02-29'), false);
    assert.equal(D.isValidISODate('2028-02-29'), true);
  });
});
