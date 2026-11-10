'use strict';

/** Guards against spreadsheet formula injection when a CSV is opened in Excel. */
function safeCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {object[]} rows
 * @param {{key: string, label: string}[]} columns
 */
function toCsv(rows, columns) {
  const lines = [columns.map((c) => safeCell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => safeCell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  // BOM so Excel opens UTF-8 (currency symbols, non-Latin names) correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF/LF. */
function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Parses a CSV with a header row into objects keyed by header. */
function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

module.exports = { toCsv, parseCsv, parseCsvObjects, safeCell };
