'use strict';
// HTML report templates (rendered to PDF by the main process) and Excel workbook builder.
const ExcelJS = require('exceljs');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function moneyFormatter(settings) {
  let nf;
  try {
    nf = new Intl.NumberFormat(settings.locale || 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const sym = settings.currency_symbol ?? '';
  return (n) => {
    const v = Number(n) || 0;
    return `${v < 0 ? '-' : ''}${sym}${nf.format(Math.abs(v))}`;
  };
}

function prettyDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function page(title, settings, body) {
  const business = settings.business_name ? `${esc(settings.business_name)} · ` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1d23; font-size: 11px; margin: 0; }
  header { border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  .meta { color: #6b7280; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #4b5563; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr { page-break-inside: avoid; }
  tfoot td { font-weight: 700; border-top: 2px solid #1a1d23; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
  .card { flex: 1 1 140px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
  .card .l { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
  .card .v { font-size: 17px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .ok { color: #15803d; } .bad { color: #b91c1c; } .warn { color: #b45309; }
  .muted { color: #6b7280; }
  footer { margin-top: 18px; color: #9ca3af; font-size: 9px; text-align: center; }
</style></head><body>
<header><h1>${esc(title)}</h1><div class="meta">${business}Generated ${esc(new Date().toLocaleString('en-GB'))} by DailyCollect</div></header>
${body}
<footer>DailyCollect · offline collection ledger</footer>
</body></html>`;
}

function customerHistoryHtml({ customer, ledger }, settings) {
  const money = moneyFormatter(settings);
  const rows = ledger.rows
    .map(
      (r) => `<tr><td>${esc(prettyDate(r.date))}</td><td class="num">${money(r.amount)}</td><td>${esc(r.note || '')}</td><td class="num">${money(r.running_total)}</td></tr>`
    )
    .join('');
  const body = `
  <div class="cards">
    <div class="card"><div class="l">Customer</div><div class="v" style="font-size:14px">${esc(customer.name)}</div><div class="muted">${esc(customer.phone || '')}</div></div>
    <div class="card"><div class="l">Entries</div><div class="v">${ledger.count}</div></div>
    <div class="card"><div class="l">Total collected</div><div class="v">${money(ledger.closing)}</div></div>
    <div class="card"><div class="l">Daily target</div><div class="v">${customer.daily_target ? money(customer.daily_target) : '—'}</div></div>
  </div>
  ${customer.address ? `<div class="muted">Address: ${esc(customer.address)}</div>` : ''}
  <h2>Ledger</h2>
  <table><thead><tr><th>Date</th><th class="num">Amount</th><th>Note</th><th class="num">Running total</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" class="muted">No entries.</td></tr>'}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${money(ledger.total)}</td><td></td><td class="num">${money(ledger.closing)}</td></tr></tfoot></table>`;
  return page(`Collection history — ${customer.name}`, settings, body);
}

function dayClosingHtml(data, settings) {
  const money = moneyFormatter(settings);
  const counted = data.counted;
  const diff = counted == null ? null : Math.round((counted - data.total) * 100) / 100;
  const diffClass = diff == null ? '' : diff === 0 ? 'ok' : diff < 0 ? 'bad' : 'warn';
  const diffLabel = diff == null ? 'Not counted' : diff === 0 ? 'Balanced' : diff < 0 ? `Short by ${money(-diff)}` : `Excess ${money(diff)}`;
  const byCustomer = data.byCustomer
    .map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.name)}</td><td class="num">${c.entries}</td><td class="num">${money(c.total)}</td></tr>`)
    .join('');
  const entries = data.entries
    .slice()
    .reverse()
    .map((e) => `<tr><td>${esc(String(e.created_at).slice(11, 16))}</td><td>${esc(e.customer_name)}</td><td class="num">${money(e.amount)}</td><td>${esc(e.note || '')}</td></tr>`)
    .join('');
  const body = `
  <div class="cards">
    <div class="card"><div class="l">Total collected</div><div class="v">${money(data.total)}</div></div>
    <div class="card"><div class="l">Customers paid</div><div class="v">${data.customers} / ${data.activeCustomers}</div></div>
    <div class="card"><div class="l">Entries</div><div class="v">${data.entries.length}</div></div>
    <div class="card"><div class="l">Cash counted</div><div class="v">${counted == null ? '—' : money(counted)}</div></div>
    <div class="card"><div class="l">Difference</div><div class="v ${diffClass}">${esc(diffLabel)}</div></div>
  </div>
  ${data.note ? `<p><strong>Note:</strong> ${esc(data.note)}</p>` : ''}
  <h2>By customer</h2>
  <table><thead><tr><th>#</th><th>Customer</th><th class="num">Entries</th><th class="num">Total</th></tr></thead>
  <tbody>${byCustomer || '<tr><td colspan="4" class="muted">No collections.</td></tr>'}</tbody>
  <tfoot><tr><td></td><td>Total</td><td class="num">${data.entries.length}</td><td class="num">${money(data.total)}</td></tr></tfoot></table>
  <h2>All entries</h2>
  <table><thead><tr><th>Time</th><th>Customer</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>${entries || '<tr><td colspan="4" class="muted">No entries.</td></tr>'}</tbody></table>
  <p style="margin-top:30px">Counted by: ____________________ &nbsp;&nbsp; Signature: ____________________</p>`;
  return page(`Day closing report — ${prettyDate(data.date)}`, settings, body);
}

function entriesHtml({ title, rows }, settings) {
  const money = moneyFormatter(settings);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const body = `
  <div class="cards">
    <div class="card"><div class="l">Entries</div><div class="v">${rows.length}</div></div>
    <div class="card"><div class="l">Total</div><div class="v">${money(total)}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Customer</th><th class="num">Amount</th><th>Note</th></tr></thead>
  <tbody>${rows.map((r) => `<tr><td>${esc(prettyDate(r.date))}</td><td>${esc(r.customer_name)}</td><td class="num">${money(r.amount)}</td><td>${esc(r.note || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No entries.</td></tr>'}</tbody>
  <tfoot><tr><td colspan="2">Total</td><td class="num">${money(total)}</td><td></td></tr></tfoot></table>`;
  return page(title, settings, body);
}

function fullReportHtml(data, settings) {
  const money = moneyFormatter(settings);
  const total = data.collections.reduce((a, r) => a + r.amount, 0);
  const customers = data.customers
    .map(
      (c) =>
        `<tr><td>${esc(c.name)}${c.active ? '' : ' <span class="muted">(inactive)</span>'}</td><td>${esc(c.phone || '')}</td><td class="num">${c.daily_target ? money(c.daily_target) : '—'}</td><td class="num">${c.entry_count}</td><td>${esc(c.last_date ? prettyDate(c.last_date) : '—')}</td><td class="num">${money(c.total)}</td></tr>`
    )
    .join('');
  const daily = data.dailyTotals
    .slice()
    .reverse()
    .map((d) => `<tr><td>${esc(prettyDate(d.date))}</td><td class="num">${d.customers}</td><td class="num">${d.entries}</td><td class="num">${money(d.total)}</td></tr>`)
    .join('');
  const body = `
  <div class="cards">
    <div class="card"><div class="l">Customers</div><div class="v">${data.customers.length}</div></div>
    <div class="card"><div class="l">Entries</div><div class="v">${data.collections.length}</div></div>
    <div class="card"><div class="l">Days with collections</div><div class="v">${data.dailyTotals.length}</div></div>
    <div class="card"><div class="l">Total collected</div><div class="v">${money(total)}</div></div>
  </div>
  <h2>Customers</h2>
  <table><thead><tr><th>Name</th><th>Phone</th><th class="num">Target</th><th class="num">Entries</th><th>Last paid</th><th class="num">Total</th></tr></thead><tbody>${customers || '<tr><td colspan="6" class="muted">No customers.</td></tr>'}</tbody></table>
  <h2>Daily totals</h2>
  <table><thead><tr><th>Date</th><th class="num">Customers</th><th class="num">Entries</th><th class="num">Total</th></tr></thead><tbody>${daily || '<tr><td colspan="4" class="muted">No collections.</td></tr>'}</tbody>
  <tfoot><tr><td colspan="3">Grand total</td><td class="num">${money(total)}</td></tr></tfoot></table>`;
  return page('DailyCollect — full report', settings, body);
}

async function buildWorkbook(data, settings) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DailyCollect';
  wb.created = new Date();
  const numFmt = `"${(settings.currency_symbol || '').replace(/"/g, '')}"#,##0.00`;

  const addSheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width || 16, style: c.money ? { numFmt } : {} }));
    rows.forEach((r) => ws.addRow(columns.reduce((o, c) => ({ ...o, [c.key]: c.value ? c.value(r) : r[c.key] }), {})));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  };

  addSheet(
    'Customers',
    [
      { key: 'id', label: 'ID', width: 6 },
      { key: 'name', label: 'Name', width: 26 },
      { key: 'phone', label: 'Phone', width: 16 },
      { key: 'address', label: 'Address', width: 30 },
      { key: 'notes', label: 'Notes', width: 30 },
      { key: 'start_date', label: 'Start date', width: 12 },
      { key: 'daily_target', label: 'Daily target', money: true },
      { key: 'active', label: 'Active', width: 8, value: (r) => (r.active ? 'Yes' : 'No') },
      { key: 'entry_count', label: 'Entries', width: 9 },
      { key: 'last_date', label: 'Last paid', width: 12 },
      { key: 'total', label: 'Total collected', money: true, width: 18 },
      { key: 'created_at', label: 'Created at', width: 20 },
    ],
    data.customers
  );
  addSheet(
    'Collections',
    [
      { key: 'id', label: 'ID', width: 7 },
      { key: 'date', label: 'Date', width: 12 },
      { key: 'customer_name', label: 'Customer', width: 26 },
      { key: 'customer_id', label: 'Customer ID', width: 11 },
      { key: 'amount', label: 'Amount', money: true },
      { key: 'note', label: 'Note', width: 30 },
      { key: 'created_at', label: 'Created at', width: 20 },
      { key: 'updated_at', label: 'Updated at', width: 20 },
    ],
    data.collections
  );
  addSheet(
    'Daily totals',
    [
      { key: 'date', label: 'Date', width: 12 },
      { key: 'customers', label: 'Customers', width: 11 },
      { key: 'entries', label: 'Entries', width: 9 },
      { key: 'total', label: 'Total', money: true },
    ],
    data.dailyTotals
  );
  addSheet(
    'Day closings',
    [
      { key: 'date', label: 'Date', width: 12 },
      { key: 'expected', label: 'Collected', money: true },
      { key: 'counted', label: 'Counted', money: true },
      { key: 'difference', label: 'Difference', money: true },
      { key: 'note', label: 'Note', width: 30 },
      { key: 'closed_at', label: 'Closed at', width: 20 },
    ],
    data.closings
  );
  addSheet(
    'Audit log',
    [
      { key: 'id', label: 'ID', width: 7 },
      { key: 'timestamp', label: 'Timestamp', width: 20 },
      { key: 'action', label: 'Action', width: 22 },
      { key: 'details', label: 'Details', width: 80 },
    ],
    data.audit
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { customerHistoryHtml, dayClosingHtml, entriesHtml, fullReportHtml, buildWorkbook, moneyFormatter, esc };
