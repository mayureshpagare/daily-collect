'use strict';
const D = require('./dates');
const {
  ValidationError,
  NotFoundError,
  round2,
  isBlank,
  cleanText,
  parseAmount,
  parseDate,
  parseOptionalDate,
  parseId,
  validateCustomer,
} = require('./validation');
const { computeInsights, linearForecast } = require('./insights');

const DEFAULT_SETTINGS = {
  business_name: '',
  currency_symbol: '₹',
  locale: 'en-IN',
  theme: 'system',
  missed_threshold: '3',
  reminder_template:
    'Hello {name}, this is a friendly reminder from {business}. We have not received your payment for {days} day(s). Your last payment was {last_amount} on {last_date}. Thank you!',
  backup_enabled: '0',
  backup_folder: '',
  backup_keep: '30',
  last_backup_at: '',
  last_backup_file: '',
};

const PUBLIC_SETTING_KEYS = ['business_name', 'currency_symbol', 'locale', 'theme', 'missed_threshold', 'reminder_template', 'backup_enabled', 'backup_folder', 'backup_keep'];

const CUSTOMER_WITH_STATS = `
  SELECT c.*,
         COALESCE(s.total, 0)     AS total,
         COALESCE(s.cnt, 0)       AS entry_count,
         s.last_date              AS last_date
  FROM customers c
  LEFT JOIN (
    SELECT customer_id, ROUND(SUM(amount), 2) AS total, COUNT(*) AS cnt, MAX(date) AS last_date
    FROM collections GROUP BY customer_id
  ) s ON s.customer_id = c.id`;

function createRepo(db) {
  const audit = (action, details) => {
    db.prepare('INSERT INTO audit_log (action, details) VALUES (?, ?)').run(action, JSON.stringify(details ?? {}));
  };

  // ---------------------------------------------------------------- settings
  function getRawSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : DEFAULT_SETTINGS[key] ?? null;
  }

  function setRawSetting(key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value == null ? null : String(value));
  }

  function getSettings() {
    const out = { ...DEFAULT_SETTINGS };
    for (const row of db.prepare('SELECT key, value FROM settings').all()) {
      if (row.key in DEFAULT_SETTINGS) out[row.key] = row.value ?? '';
    }
    return {
      ...out,
      missed_threshold: Number(out.missed_threshold) || 3,
      backup_keep: Number(out.backup_keep) || 30,
      backup_enabled: out.backup_enabled === '1',
      hasPin: !!getRawSetting('pin_hash'),
    };
  }

  function setSettings(partial = {}) {
    const clean = {};
    for (const [key, raw] of Object.entries(partial)) {
      if (!PUBLIC_SETTING_KEYS.includes(key)) continue;
      let v = raw;
      switch (key) {
        case 'currency_symbol':
          v = String(raw ?? '').trim();
          if (v.length > 5) throw new ValidationError('Currency symbol can be at most 5 characters.');
          break;
        case 'locale':
          v = String(raw ?? '').trim() || 'en-IN';
          try {
            new Intl.NumberFormat(v).format(1);
          } catch {
            throw new ValidationError(`"${v}" is not a valid number format locale.`);
          }
          break;
        case 'theme':
          if (!['system', 'light', 'dark'].includes(raw)) throw new ValidationError('Theme must be system, light or dark.');
          break;
        case 'missed_threshold':
        case 'backup_keep': {
          const n = Number(raw);
          if (!Number.isInteger(n) || n < 1 || n > 365) throw new ValidationError('Value must be a whole number between 1 and 365.');
          v = String(n);
          break;
        }
        case 'backup_enabled':
          v = raw ? '1' : '0';
          break;
        case 'business_name':
          v = cleanText(raw, 100, 'Business name') || '';
          break;
        case 'reminder_template':
          v = cleanText(raw, 1000, 'Reminder template') || DEFAULT_SETTINGS.reminder_template;
          break;
        default:
          v = raw == null ? '' : String(raw);
      }
      clean[key] = v;
    }
    db.transaction(() => {
      for (const [k, v] of Object.entries(clean)) setRawSetting(k, v);
      if (Object.keys(clean).length) audit('settings.update', { keys: Object.keys(clean) });
    })();
    return getSettings();
  }

  // --------------------------------------------------------------- customers
  function getCustomerRow(id) {
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  }

  function requireCustomer(id) {
    const c = getCustomerRow(parseId(id, 'customer'));
    if (!c) throw new NotFoundError('Customer not found. It may have been deleted.');
    return c;
  }

  function getCustomer(id) {
    const c = db.prepare(`${CUSTOMER_WITH_STATS} WHERE c.id = ?`).get(parseId(id, 'customer'));
    if (!c) throw new NotFoundError('Customer not found. It may have been deleted.');
    return c;
  }

  function listCustomers({ search = '', includeInactive = true } = {}) {
    const where = [];
    const params = {};
    if (!includeInactive) where.push('c.active = 1');
    if (search && search.trim()) {
      where.push("(c.name LIKE @q OR IFNULL(c.phone, '') LIKE @q OR IFNULL(c.address, '') LIKE @q)");
      params.q = `%${search.trim()}%`;
    }
    const sql = `${CUSTOMER_WITH_STATS} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.name COLLATE NOCASE, c.id`;
    return db.prepare(sql).all(params);
  }

  function assertPhoneUnique(phone, exceptId = 0) {
    if (!phone) return;
    const row = db.prepare('SELECT id, name FROM customers WHERE phone = ? AND id <> ?').get(phone, exceptId);
    if (row) throw new ValidationError(`Phone number ${phone} is already used by "${row.name}".`);
  }

  function createCustomer(input) {
    const c = validateCustomer(input);
    return db.transaction(() => {
      assertPhoneUnique(c.phone);
      const info = db
        .prepare(
          `INSERT INTO customers (name, phone, address, notes, start_date, daily_target, active)
           VALUES (@name, @phone, @address, @notes, @start_date, @daily_target, @active)`
        )
        .run(c);
      const id = Number(info.lastInsertRowid);
      audit('customer.create', { id, ...c });
      return getCustomer(id);
    })();
  }

  function updateCustomer(id, input) {
    const before = requireCustomer(id);
    const c = validateCustomer({ active: before.active, ...input });
    return db.transaction(() => {
      assertPhoneUnique(c.phone, before.id);
      db.prepare(
        `UPDATE customers SET name = @name, phone = @phone, address = @address, notes = @notes,
           start_date = @start_date, daily_target = @daily_target, active = @active WHERE id = @id`
      ).run({ ...c, id: before.id });
      const changes = {};
      for (const k of Object.keys(c)) {
        if ((before[k] ?? null) !== (c[k] ?? null)) changes[k] = { from: before[k] ?? null, to: c[k] ?? null };
      }
      if (Object.keys(changes).length) audit('customer.update', { id: before.id, name: c.name, changes });
      return getCustomer(before.id);
    })();
  }

  function setCustomerActive(id, active) {
    const c = requireCustomer(id);
    db.prepare('UPDATE customers SET active = ? WHERE id = ?').run(active ? 1 : 0, c.id);
    audit(active ? 'customer.activate' : 'customer.deactivate', { id: c.id, name: c.name });
    return getCustomer(c.id);
  }

  function customerEntryStats(id) {
    return db.prepare('SELECT COUNT(*) AS count, ROUND(IFNULL(SUM(amount), 0), 2) AS total FROM collections WHERE customer_id = ?').get(id);
  }

  function deleteCustomerPreview(id) {
    const c = requireCustomer(id);
    const s = customerEntryStats(c.id);
    return { id: c.id, name: c.name, phone: c.phone, entryCount: s.count, total: s.total };
  }

  /**
   * Permanently deletes a customer. Their collection entries are removed by the
   * ON DELETE CASCADE foreign key. The typed name must match the customer's name.
   */
  function deleteCustomer(id, confirmName) {
    return db.transaction(() => {
      const c = requireCustomer(id);
      if (String(confirmName ?? '').trim() !== c.name.trim()) {
        throw new ValidationError('The name you typed does not match. The customer was NOT deleted.');
      }
      const s = customerEntryStats(c.id);
      db.prepare('DELETE FROM customers WHERE id = ?').run(c.id);
      const remaining = db.prepare('SELECT COUNT(*) AS n FROM collections WHERE customer_id = ?').get(c.id).n;
      if (remaining !== 0) {
        // Throwing inside the transaction rolls everything back.
        throw new Error('Cascade delete failed: some entries remained, so nothing was deleted.');
      }
      audit('customer.delete', { id: c.id, name: c.name, phone: c.phone, deleted_entries: s.count, deleted_total: s.total });
      return { id: c.id, name: c.name, deletedEntries: s.count, deletedTotal: s.total };
    })();
  }

  const HEADER_ALIASES = {
    name: 'name',
    'customer name': 'name',
    customer: 'name',
    phone: 'phone',
    mobile: 'phone',
    'phone number': 'phone',
    address: 'address',
    notes: 'notes',
    note: 'notes',
    start_date: 'start_date',
    'start date': 'start_date',
    daily_target: 'daily_target',
    'daily target': 'daily_target',
    target: 'daily_target',
  };

  /** rows: array of objects keyed by CSV header. Each row is validated on its own; bad rows are reported and skipped. */
  function importCustomers(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('The CSV file has no data rows.');
    const imported = [];
    const skipped = [];
    db.transaction(() => {
      rows.forEach((raw, i) => {
        const mapped = {};
        for (const [k, v] of Object.entries(raw)) {
          const key = HEADER_ALIASES[String(k).trim().toLowerCase()];
          if (key) mapped[key] = v;
        }
        try {
          const c = validateCustomer(mapped);
          assertPhoneUnique(c.phone);
          const info = db
            .prepare(
              `INSERT INTO customers (name, phone, address, notes, start_date, daily_target, active)
               VALUES (@name, @phone, @address, @notes, @start_date, @daily_target, @active)`
            )
            .run(c);
          imported.push({ id: Number(info.lastInsertRowid), name: c.name });
        } catch (err) {
          if (err.code !== 'VALIDATION') throw err;
          skipped.push({ line: i + 2, name: mapped.name || '', reason: err.message });
        }
      });
      audit('customer.import', { imported: imported.length, skipped: skipped.length });
    })();
    return { imported: imported.length, skipped };
  }

  // ------------------------------------------------------------- collections
  function getCollection(id) {
    const row = db
      .prepare('SELECT col.*, c.name AS customer_name FROM collections col JOIN customers c ON c.id = col.customer_id WHERE col.id = ?')
      .get(parseId(id, 'entry'));
    if (!row) throw new NotFoundError('Entry not found. It may have been deleted.');
    return row;
  }

  function addCollection(input = {}) {
    const customer = requireCustomer(input.customer_id);
    const amount = parseAmount(input.amount);
    const date = parseDate(input.date);
    const note = cleanText(input.note, 300, 'Note');
    return db.transaction(() => {
      const info = db.prepare('INSERT INTO collections (customer_id, amount, date, note) VALUES (?, ?, ?, ?)').run(customer.id, amount, date, note);
      const id = Number(info.lastInsertRowid);
      audit('collection.create', { id, customer_id: customer.id, customer: customer.name, amount, date, note });
      return getCollection(id);
    })();
  }

  /** Saves many entries for one date atomically: either every row is saved or none is. */
  function addCollectionsBulk({ date, items } = {}) {
    date = parseDate(date);
    if (!Array.isArray(items) || items.length === 0) throw new ValidationError('Nothing to save. Enter at least one amount.');
    const prepared = [];
    const errors = [];
    items.forEach((item, i) => {
      try {
        const customer = requireCustomer(item.customer_id);
        prepared.push({ customer, amount: parseAmount(item.amount), note: cleanText(item.note, 300, 'Note') });
      } catch (err) {
        if (err.code !== 'VALIDATION' && err.code !== 'NOT_FOUND') throw err;
        errors.push({ index: i, customer_id: item.customer_id, error: err.message });
      }
    });
    if (errors.length) {
      const e = new ValidationError(`${errors.length} row(s) have problems. Nothing was saved. First problem: ${errors[0].error}`);
      e.details = errors;
      throw e;
    }
    return db.transaction(() => {
      const stmt = db.prepare('INSERT INTO collections (customer_id, amount, date, note) VALUES (?, ?, ?, ?)');
      for (const p of prepared) stmt.run(p.customer.id, p.amount, date, p.note);
      const total = round2(prepared.reduce((a, p) => a + p.amount, 0));
      audit('collection.bulk_create', {
        date,
        count: prepared.length,
        total,
        items: prepared.map((p) => ({ customer_id: p.customer.id, customer: p.customer.name, amount: p.amount })),
      });
      return { count: prepared.length, total };
    })();
  }

  function updateCollection(id, input = {}) {
    const before = getCollection(id);
    const after = {
      amount: input.amount === undefined ? before.amount : parseAmount(input.amount),
      date: input.date === undefined ? before.date : parseDate(input.date),
      note: input.note === undefined ? before.note : cleanText(input.note, 300, 'Note'),
    };
    const changed = ['amount', 'date', 'note'].filter((k) => (before[k] ?? null) !== (after[k] ?? null));
    if (!changed.length) return before;
    return db.transaction(() => {
      db.prepare("UPDATE collections SET amount = ?, date = ?, note = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(
        after.amount,
        after.date,
        after.note,
        before.id
      );
      audit('collection.update', {
        id: before.id,
        customer_id: before.customer_id,
        customer: before.customer_name,
        before: { amount: before.amount, date: before.date, note: before.note },
        after,
        changed,
      });
      return getCollection(before.id);
    })();
  }

  function deleteCollection(id) {
    const before = getCollection(id);
    db.transaction(() => {
      db.prepare('DELETE FROM collections WHERE id = ?').run(before.id);
      audit('collection.delete', {
        id: before.id,
        customer_id: before.customer_id,
        customer: before.customer_name,
        amount: before.amount,
        date: before.date,
        note: before.note,
      });
    })();
    return { id: before.id };
  }

  function listEntries({ from = null, to = null, customerId = null, search = '', limit = 5000 } = {}) {
    from = parseOptionalDate(from, 'From date');
    to = parseOptionalDate(to, 'To date');
    const where = [];
    const params = { limit: Math.min(Number(limit) || 5000, 50000) };
    if (from) {
      where.push('col.date >= @from');
      params.from = from;
    }
    if (to) {
      where.push('col.date <= @to');
      params.to = to;
    }
    if (customerId) {
      where.push('col.customer_id = @cid');
      params.cid = parseId(customerId, 'customer');
    }
    if (search && search.trim()) {
      where.push("(c.name LIKE @q OR IFNULL(col.note, '') LIKE @q)");
      params.q = `%${search.trim()}%`;
    }
    return db
      .prepare(
        `SELECT col.*, c.name AS customer_name, c.phone AS customer_phone
         FROM collections col JOIN customers c ON c.id = col.customer_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY col.date DESC, col.id DESC LIMIT @limit`
      )
      .all(params);
  }

  function entriesForDate(date) {
    date = parseDate(date);
    return db
      .prepare(
        `SELECT col.*, c.name AS customer_name FROM collections col JOIN customers c ON c.id = col.customer_id
         WHERE col.date = ? ORDER BY col.id DESC`
      )
      .all(date);
  }

  /** Customer ledger with running total. Entries before `from` are carried in as the opening balance. */
  function getLedger(customerId, { from = null, to = null } = {}) {
    const c = requireCustomer(customerId);
    from = parseOptionalDate(from, 'From date');
    to = parseOptionalDate(to, 'To date');
    const opening = from
      ? db.prepare('SELECT ROUND(IFNULL(SUM(amount), 0), 2) AS s FROM collections WHERE customer_id = ? AND date < ?').get(c.id, from).s
      : 0;
    const rows = db
      .prepare(
        `SELECT id, customer_id, date, amount, note, created_at, updated_at,
                ROUND(@opening + SUM(amount) OVER (ORDER BY date, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS running_total
         FROM collections
         WHERE customer_id = @id AND (@from IS NULL OR date >= @from) AND (@to IS NULL OR date <= @to)
         ORDER BY date, id`
      )
      .all({ id: c.id, opening, from, to });
    const total = round2(rows.reduce((a, r) => a + r.amount, 0));
    return { customer: { id: c.id, name: c.name }, opening, total, closing: round2(opening + total), count: rows.length, rows };
  }

  function historyByDate({ from = null, to = null } = {}) {
    from = parseOptionalDate(from, 'From date');
    to = parseOptionalDate(to, 'To date');
    const rows = db
      .prepare(
        `SELECT date, COUNT(*) AS entries, COUNT(DISTINCT customer_id) AS customers, ROUND(SUM(amount), 2) AS total
         FROM collections WHERE (@from IS NULL OR date >= @from) AND (@to IS NULL OR date <= @to)
         GROUP BY date ORDER BY date DESC`
      )
      .all({ from, to });
    return {
      rows,
      total: round2(rows.reduce((a, r) => a + r.total, 0)),
      entries: rows.reduce((a, r) => a + r.entries, 0),
      days: rows.length,
    };
  }

  // --------------------------------------------------------------- dashboard
  function dailySeries(from, to, customerId = null) {
    const rows = db
      .prepare(
        `SELECT date, ROUND(SUM(amount), 2) AS total FROM collections
         WHERE date BETWEEN @from AND @to AND (@cid IS NULL OR customer_id = @cid) GROUP BY date`
      )
      .all({ from, to, cid: customerId });
    const map = Object.fromEntries(rows.map((r) => [r.date, r.total]));
    return D.dateRange(from, to).map((date) => ({ date, total: map[date] || 0 }));
  }

  function getDashboard(today = D.today()) {
    today = parseDate(today);
    const monthStart = D.monthStart(today);
    const sumRange = db.prepare('SELECT ROUND(IFNULL(SUM(amount), 0), 2) AS total, COUNT(*) AS entries FROM collections WHERE date BETWEEN ? AND ?');
    const t = sumRange.get(today, today);
    const y = sumRange.get(D.addDays(today, -1), D.addDays(today, -1));
    const m = sumRange.get(monthStart, today);
    const all = db.prepare('SELECT ROUND(IFNULL(SUM(amount), 0), 2) AS total FROM collections').get();
    const activeCustomers = db.prepare('SELECT COUNT(*) AS n FROM customers WHERE active = 1').get().n;
    const paidToday = db
      .prepare('SELECT COUNT(DISTINCT col.customer_id) AS n FROM collections col JOIN customers c ON c.id = col.customer_id WHERE c.active = 1 AND col.date = ?')
      .get(today).n;
    const topCollectors = db
      .prepare(
        `SELECT c.id, c.name, ROUND(SUM(col.amount), 2) AS total, COUNT(*) AS entries
         FROM collections col JOIN customers c ON c.id = col.customer_id
         WHERE col.date BETWEEN ? AND ? GROUP BY c.id ORDER BY total DESC LIMIT 5`
      )
      .all(monthStart, today);
    const notPaidList = db
      .prepare(
        `SELECT c.id, c.name, c.phone, c.daily_target FROM customers c
         WHERE c.active = 1 AND NOT EXISTS (SELECT 1 FROM collections col WHERE col.customer_id = c.id AND col.date = ?)
         ORDER BY c.name COLLATE NOCASE LIMIT 8`
      )
      .all(today);
    const last30 = dailySeries(D.addDays(today, -29), today);
    const forecast = linearForecast(dailySeries(D.addDays(today, -27), today), 7);
    return {
      today,
      todayTotal: t.total,
      todayEntries: t.entries,
      yesterdayTotal: y.total,
      monthTotal: m.total,
      monthEntries: m.entries,
      allTimeTotal: all.total,
      activeCustomers,
      paidToday,
      notPaidToday: activeCustomers - paidToday,
      notPaidList,
      topCollectors,
      last30,
      last30Total: round2(last30.reduce((a, d) => a + d.total, 0)),
      forecast,
      recentToday: entriesForDate(today).slice(0, 8),
    };
  }

  // ------------------------------------------------------------ missed days
  function getMissed(today = D.today()) {
    today = parseDate(today);
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.phone, c.daily_target, c.start_date, c.created_at,
                l.last_date,
                (SELECT ROUND(SUM(x.amount), 2) FROM collections x WHERE x.customer_id = c.id AND x.date = l.last_date) AS last_amount
         FROM customers c
         LEFT JOIN (SELECT customer_id, MAX(date) AS last_date FROM collections WHERE date <= @today GROUP BY customer_id) l
           ON l.customer_id = c.id
         WHERE c.active = 1
         ORDER BY c.name COLLATE NOCASE`
      )
      .all({ today });
    return rows
      .map((r) => {
        const start = r.start_date || String(r.created_at).slice(0, 10);
        const paidToday = r.last_date === today;
        // Days in a row without a payment, counting today.
        let daysWithout;
        if (r.last_date) daysWithout = D.diffDays(r.last_date, today);
        else daysWithout = start <= today ? D.diffDays(start, today) + 1 : 0;
        return { ...r, paidToday, neverPaid: !r.last_date, daysWithout: Math.max(0, daysWithout) };
      })
      .sort((a, b) => b.daysWithout - a.daysWithout || a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- insights
  function getCustomerInsights(customerId, today = D.today()) {
    const c = requireCustomer(customerId);
    today = parseDate(today);
    const rows = db
      .prepare('SELECT date, ROUND(SUM(amount), 2) AS total FROM collections WHERE customer_id = ? AND date <= ? GROUP BY date ORDER BY date')
      .all(c.id, today);
    const daily = Object.fromEntries(rows.map((r) => [r.date, r.total]));
    const candidates = [c.start_date, rows[0]?.date, String(c.created_at).slice(0, 10)].filter(Boolean);
    const start = candidates.reduce((a, b) => (b < a ? b : a));
    return computeInsights({ daily, start, today, target: c.daily_target });
  }

  function getHeatmap(customerId, { from, to } = {}) {
    const c = requireCustomer(customerId);
    to = parseDate(to || D.today(), 'To date');
    from = parseDate(from || D.addDays(to, -364), 'From date');
    const rows = db
      .prepare('SELECT date, ROUND(SUM(amount), 2) AS total, COUNT(*) AS entries FROM collections WHERE customer_id = ? AND date BETWEEN ? AND ? GROUP BY date')
      .all(c.id, from, to);
    const years = db
      .prepare("SELECT DISTINCT substr(date, 1, 4) AS y FROM collections WHERE customer_id = ? ORDER BY y DESC")
      .all(c.id)
      .map((r) => Number(r.y));
    return { from, to, days: rows, years, target: c.daily_target };
  }

  // ------------------------------------------------------------- day closing
  function getDayClosing(date) {
    date = parseDate(date);
    const summary = db
      .prepare('SELECT ROUND(IFNULL(SUM(amount), 0), 2) AS total, COUNT(*) AS entries, COUNT(DISTINCT customer_id) AS customers FROM collections WHERE date = ?')
      .get(date);
    const byCustomer = db
      .prepare(
        `SELECT c.id, c.name, COUNT(*) AS entries, ROUND(SUM(col.amount), 2) AS total
         FROM collections col JOIN customers c ON c.id = col.customer_id
         WHERE col.date = ? GROUP BY c.id ORDER BY total DESC`
      )
      .all(date);
    const activeCustomers = db.prepare('SELECT COUNT(*) AS n FROM customers WHERE active = 1').get().n;
    const closing = db.prepare('SELECT * FROM day_closings WHERE date = ?').get(date) || null;
    return { date, ...summary, activeCustomers, byCustomer, entries: entriesForDate(date), closing };
  }

  function saveDayClosing({ date, counted, note } = {}) {
    date = parseDate(date);
    counted = parseAmount(counted, { field: 'Counted cash', allowZero: true });
    note = cleanText(note, 500, 'Note');
    return db.transaction(() => {
      const expected = db.prepare('SELECT ROUND(IFNULL(SUM(amount), 0), 2) AS t FROM collections WHERE date = ?').get(date).t;
      const difference = round2(counted - expected);
      db.prepare(
        `INSERT INTO day_closings (date, expected, counted, difference, note) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET expected = excluded.expected, counted = excluded.counted,
           difference = excluded.difference, note = excluded.note, closed_at = datetime('now', 'localtime')`
      ).run(date, expected, counted, difference, note);
      audit('day.close', { date, expected, counted, difference, note });
      return db.prepare('SELECT * FROM day_closings WHERE date = ?').get(date);
    })();
  }

  function listDayClosings(limit = 30) {
    return db.prepare('SELECT * FROM day_closings ORDER BY date DESC LIMIT ?').all(Math.min(Number(limit) || 30, 1000));
  }

  // ------------------------------------------------------------------- audit
  function listAudit({ search = '', limit = 100, offset = 0 } = {}) {
    const params = { limit: Math.min(Number(limit) || 100, 1000), offset: Math.max(Number(offset) || 0, 0) };
    let where = '';
    if (search && search.trim()) {
      where = 'WHERE action LIKE @q OR details LIKE @q';
      params.q = `%${search.trim()}%`;
    }
    const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${where}`).get(params.q ? { q: params.q } : {}).n;
    const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT @limit OFFSET @offset`).all(params);
    return { total, rows };
  }

  // ------------------------------------------------------------------ export
  function exportAll() {
    return {
      customers: listCustomers({ includeInactive: true }),
      collections: db
        .prepare(
          `SELECT col.id, col.date, c.name AS customer_name, col.customer_id, col.amount, col.note, col.created_at, col.updated_at
           FROM collections col JOIN customers c ON c.id = col.customer_id ORDER BY col.date, col.id`
        )
        .all(),
      dailyTotals: historyByDate({}).rows.slice().reverse(),
      closings: db.prepare('SELECT * FROM day_closings ORDER BY date').all(),
      audit: db.prepare('SELECT * FROM audit_log ORDER BY id').all(),
    };
  }

  return {
    audit,
    // settings
    getSettings,
    setSettings,
    getRawSetting,
    setRawSetting,
    hasPin: () => !!getRawSetting('pin_hash'),
    // customers
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    setCustomerActive,
    deleteCustomerPreview,
    deleteCustomer,
    importCustomers,
    // collections
    getCollection,
    addCollection,
    addCollectionsBulk,
    updateCollection,
    deleteCollection,
    listEntries,
    entriesForDate,
    getLedger,
    historyByDate,
    // reports
    getDashboard,
    getMissed,
    getCustomerInsights,
    getHeatmap,
    getDayClosing,
    saveDayClosing,
    listDayClosings,
    listAudit,
    exportAll,
    isBlank,
  };
}

module.exports = { createRepo, DEFAULT_SETTINGS };
