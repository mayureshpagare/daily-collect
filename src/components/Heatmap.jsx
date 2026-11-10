import React, { useMemo, useState } from 'react';
import { addDays, dateRange, weekday } from '../lib/dates';
import { fmtDate } from '../lib/format';

const CELL = 14;
const GAP = 3;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Calendar heatmap: one column per week, one row per weekday.
 * Intensity is relative to the daily target when one is set, otherwise to this customer's own amounts (quartiles).
 */
export default function Heatmap({ days, from, to, target, money, today }) {
  const [hover, setHover] = useState(null);
  const map = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);

  const level = useMemo(() => {
    if (target && target > 0) {
      return (v) => (v <= 0 ? 0 : v < target * 0.5 ? 1 : v < target ? 2 : v < target * 1.5 ? 3 : 4);
    }
    const vals = days.map((d) => d.total).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 0;
    const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
    return (v) => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4);
  }, [days, target]);

  const gridStart = addDays(from, -weekday(from)); // back to Sunday
  const all = dateRange(gridStart, to);
  const weeks = Math.ceil(all.length / 7);
  const left = 30;
  const top = 18;
  const width = left + weeks * (CELL + GAP);
  const height = top + 7 * (CELL + GAP);

  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const d = all[w * 7];
    if (!d) continue;
    const m = Number(d.slice(5, 7)) - 1;
    if (m !== lastMonth && w * 7 + 6 < all.length) {
      monthLabels.push({ w, label: MONTHS[m] });
      lastMonth = m;
    }
  }

  const paidDays = days.filter((d) => d.total > 0).length;
  const totalDays = dateRange(from, to < today ? to : today).length;

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-scroll">
        <svg width={width} height={height} className="heatmap" role="img" aria-label="Payment calendar heatmap">
          {monthLabels.map((m) => (
            <text key={`${m.w}-${m.label}`} x={left + m.w * (CELL + GAP)} y={11} className="axis-text">
              {m.label}
            </text>
          ))}
          {['Mon', 'Wed', 'Fri'].map((l, i) => (
            <text key={l} x={0} y={top + (1 + i * 2) * (CELL + GAP) + 11} className="axis-text">
              {l}
            </text>
          ))}
          {all.map((d, i) => {
            if (d < from) return null;
            const w = Math.floor(i / 7);
            const r = i % 7;
            const v = map[d]?.total || 0;
            const future = d > today;
            return (
              <rect
                key={d}
                x={left + w * (CELL + GAP)}
                y={top + r * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={3}
                className={`hm-cell l${future ? 'f' : level(v)} ${d === today ? 'today' : ''}`}
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
      </div>
      <div className="heatmap-foot">
        <div className="muted small">
          {hover ? (
            <>
              <strong>{fmtDate(hover)}</strong> — {map[hover] ? `${money(map[hover].total)} (${map[hover].entries} entr${map[hover].entries === 1 ? 'y' : 'ies'})` : hover > today ? 'future' : 'no payment'}
            </>
          ) : (
            <>
              Paid on {paidDays} of {totalDays} days in this period{target ? ` · colours relative to daily target ${money(target)}` : ''}
            </>
          )}
        </div>
        <div className="legend">
          <span className="muted small">Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`hm-cell legend-cell l${l}`} />
          ))}
          <span className="muted small">More</span>
        </div>
      </div>
    </div>
  );
}
