import React from 'react';
import Icon from './Icon';
import { NAV } from '../nav';

export default function Sidebar({ current, onNavigate, businessName, missedCount, symbol }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">{(symbol || '¤').slice(0, 2)}</div>
        <div>
          <div className="brand-name">DailyCollect</div>
          {businessName && <div className="brand-sub">{businessName}</div>}
        </div>
      </div>
      <nav>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${current === n.id || (n.id === 'customers' && current === 'customer') ? 'active' : ''}`}
            onClick={() => onNavigate(n.id)}
            title={`${n.label} (Ctrl+${n.key})`}
          >
            <Icon name={n.icon} />
            <span className="grow">{n.label}</span>
            {n.id === 'missed' && missedCount > 0 && <span className="nav-badge">{missedCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot muted small">Offline · data stays on this computer</div>
    </aside>
  );
}
