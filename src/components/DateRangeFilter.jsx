import React from 'react';
import { PRESETS, presetRange } from '../lib/dates';
import { useApp } from '../context';

/** value: { preset, from, to } */
export default function DateRangeFilter({ value, onChange, presets = ['week', 'month', 'last30', 'lastMonth', 'all', 'custom'] }) {
  const { today } = useApp();
  const choose = (preset) => {
    if (preset === 'custom') onChange({ preset, from: value.from || presetRange('month', today).from, to: value.to || today });
    else onChange({ preset, ...presetRange(preset, today) });
  };
  return (
    <div className="range-filter">
      <div className="segmented">
        {PRESETS.filter((p) => presets.includes(p.id)).map((p) => (
          <button key={p.id} className={value.preset === p.id ? 'active' : ''} onClick={() => choose(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="row gap-sm">
          <input type="date" className="input sm" value={value.from || ''} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value || null })} />
          <span className="muted">to</span>
          <input type="date" className="input sm" value={value.to || ''} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value || null })} />
        </div>
      )}
    </div>
  );
}

export function initialRange(preset, today) {
  return { preset, ...presetRange(preset, today) };
}
