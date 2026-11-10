import React, { useLayoutEffect, useRef, useState } from 'react';

function niceCeil(max) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

/**
 * Responsive SVG bar chart.
 * data: [{ key, label, value, tip?, muted? }]  (muted bars are drawn hatched, e.g. forecasts)
 */
export default function BarChart({ data, height = 220, format = String, formatAxis = format, highlightKey, emptyText = 'No data yet' }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 56;
  const padR = 8;
  const padT = 10;
  const padB = 26;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const max = niceCeil(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const slot = data.length ? iw / data.length : iw;
  const bw = Math.max(2, Math.min(36, slot * 0.68));
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, iw / 56)));
  const allZero = data.every((d) => !d.value);

  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={width} height={height} role="img" aria-label="Bar chart">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--primary-soft)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--primary)" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((t) => {
          const y = padT + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} className="grid-line" />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="axis-text">
                {formatAxis(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * ih;
          const x = padL + i * slot + (slot - bw) / 2;
          const y = padT + ih - h;
          const active = hover === i || d.key === highlightKey;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={ih} fill="transparent" />
              <rect
                x={x}
                y={d.value > 0 ? y : padT + ih - 1}
                width={bw}
                height={d.value > 0 ? Math.max(h, 2) : 1}
                rx={Math.min(4, bw / 3)}
                className={`bar ${active ? 'active' : ''} ${d.muted ? 'muted' : ''}`}
                fill={d.muted ? 'url(#hatch)' : undefined}
              />
              {i % labelEvery === 0 && (
                <text x={padL + i * slot + slot / 2} y={height - 8} textAnchor="middle" className="axis-text">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {allZero && <div className="chart-empty">{emptyText}</div>}
      {hover != null && data[hover] && (
        <div
          className="chart-tip"
          style={{
            left: Math.min(width - 150, Math.max(0, padL + hover * slot + slot / 2 - 70)),
            top: 0,
          }}
        >
          <div className="muted small">{data[hover].tip || data[hover].label}</div>
          <strong>{format(data[hover].value)}</strong>
        </div>
      )}
    </div>
  );
}
