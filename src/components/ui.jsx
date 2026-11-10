import React from 'react';
import Icon from './Icon';

export function StatCard({ label, value, sub, tone, big, onClick, icon }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat-card ${tone || ''} ${big ? 'big' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="stat-label">
        {icon && <Icon name={icon} size={15} />}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Tag>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading">
      <span className="spinner" /> {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <Icon name="alert" />
      <div>
        <strong>Could not load this data.</strong>
        <div>{message}</div>
      </div>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children, icon = 'database' }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, hint, children, required }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}
