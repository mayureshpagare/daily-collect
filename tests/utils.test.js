'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeInsights, linearForecast } = require('../electron/insights');
const { toCsv, parseCsv, parseCsvObjects } = require('../electron/csv');
const { hashPin, verifyPin, createLockGuard } = require('../electron/security');
const { openDatabase } = require('../electron/db');
const { createRepo } = require('../electron/repo');
const backup = require('../electron/backup');
const D = require('../electron/dates');

describe('insights', () => {
  test('perfect payer scores 100 and best/worst weekday are found', () => {
    const daily = {};
    // 4 weeks starting Monday 2026-01-05; Saturdays pay 300, other days 100.
    for (const d of D.dateRange('2026-01-05', '2026-02-01')) daily[d] = D.weekday(d) === 6 ? 300 : 100;
    const i = computeInsights({ daily, start: '2026-01-05', today: '2026-02-01', target: 100 });
    assert.equal(i.paidDays, 28);
    assert.equal(i.bestDay.name, 'Saturday');
    assert.ok(i.consistency >= 85 && i.consistency <= 100, `score ${i.consistency}`);
    assert.equal(i.streak.current, 28);
    assert.equal(i.forecast.points.length, 7);
  });

  test('irregular payer scores lower and score stays within 0-100', () => {
    const daily = { '2026-01-01': 500, '2026-01-09': 20 };
    const i = computeInsights({ daily, start: '2026-01-01', today: '2026-01-20', target: 100 });
    assert.ok(i.consistency >= 0 && i.consistency < 40, `score ${i.consistency}`);
    assert.equal(i.missedDays, 18);
    assert.equal(i.streak.longest, 1);
  });

  test('no data gives zeroes, no crash', () => {
    const i = computeInsights({ daily: {}, start: '2026-01-10', today: '2026-01-10' });
    assert.equal(i.total, 0);
    assert.equal(i.bestDay, null);
    assert.equal(i.consistency, 0);
  });

  test('forecast follows the trend and never goes negative', () => {
    const series = D.dateRange('2026-01-01', '2026-01-14').map((date, k) => ({ date, total: 100 + k * 10 }));
    const up = linearForecast(series);
    assert.equal(up.direction, 'up');
    assert.ok(up.points[6].amount > up.points[0].amount);
    const down = linearForecast(series.map((p, k) => ({ ...p, total: Math.max(0, 140 - k * 20) })));
    assert.ok(down.points.every((p) => p.amount >= 0));
  });
});

describe('csv', () => {
  test('round-trips quotes, commas and newlines', () => {
    const csv = toCsv([{ a: 'x, "y"', b: 'line1\nline2' }], [{ key: 'a', label: 'a' }, { key: 'b', label: 'b' }]);
    const rows = parseCsvObjects(csv);
    assert.deepEqual(rows, [{ a: 'x, "y"', b: 'line1\nline2' }]);
  });

  test('neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")' }], [{ key: 'a', label: 'a' }]);
    assert.match(csv, /"'=HYPERLINK/);
  });

  test('handles CRLF and blank lines', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n\r\n3,4'), [['a', 'b'], ['1', '2'], ['3', '4']]);
  });
});

describe('pin', () => {
  test('hash and verify', () => {
    const h = hashPin('4321');
    assert.ok(verifyPin('4321', h));
    assert.ok(!verifyPin('1234', h));
    assert.throws(() => hashPin('12'), /4 to 8 digits/);
  });

  test('lock guard backs off after 5 failures', () => {
    const g = createLockGuard();
    for (let i = 0; i < 5; i++) g.fail(0);
    assert.throws(() => g.check(1000), /Try again/);
    g.check(31000);
  });
});

describe('backup', () => {
  test('backup file is valid and restorable data', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailycollect-bk-'));
    const db = openDatabase(path.join(dir, 'live.db'));
    const repo = createRepo(db);
    const c = repo.createCustomer({ name: 'Backup Test' });
    repo.addCollection({ customer_id: c.id, date: '2026-01-01', amount: 42 });
    const file = await backup.backupTo(db, path.join(dir, 'bk'), 'auto');
    const counts = backup.validateBackupFile(file);
    assert.deepEqual(counts, { customers: 1, collections: 1 });
    assert.equal(backup.listBackups(path.join(dir, 'bk')).length, 1);
    assert.ok(backup.hasAutoBackupToday(path.join(dir, 'bk')));
    fs.writeFileSync(path.join(dir, 'junk.db'), 'not a database');
    assert.throws(() => backup.validateBackupFile(path.join(dir, 'junk.db')), /not a valid DailyCollect backup/);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
