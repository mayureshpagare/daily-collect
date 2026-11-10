import React, { useMemo, useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { fmtDate } from '../lib/format';
import { buildReminder } from '../lib/reminder';
import { Loading, ErrorBox, Tabs, Empty } from '../components/ui';
import Icon from '../components/Icon';

export default function Missed() {
  const { money, settings, setSettings, today, toast, dataVersion, navigate, openQuickEntry } = useApp();
  const [view, setView] = useState('skipped');
  const [threshold, setThreshold] = useState(settings.missed_threshold || 3);
  const { data, error, reload } = useLoad(() => api.missed(), [dataVersion, today]);

  const groups = useMemo(() => {
    const list = data || [];
    return {
      today: list.filter((c) => !c.paidToday),
      skipped: list.filter((c) => !c.paidToday && c.daysWithout >= threshold),
      all: list,
    };
  }, [data, threshold]);
  const rows = groups[view];

  const saveThreshold = async (n) => {
    setThreshold(n);
    if (n >= 1 && n <= 365) {
      try {
        setSettings(await api.settings.set({ missed_threshold: n }));
      } catch (e) {
        toast(e.message, 'error');
      }
    }
  };

  const reminder = (c) => buildReminder(settings.reminder_template, c, { money, settings, today });

  const copy = async (c) => {
    try {
      await api.clipboard(reminder(c));
      toast(`Reminder for ${c.name} copied — paste it into WhatsApp or SMS.`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const copyAll = async () => {
    const text = rows.map((c) => `${c.name}${c.phone ? ` (${c.phone})` : ''}:\n${reminder(c)}`).join('\n\n');
    await api.clipboard(text);
    toast(`${rows.length} reminders copied.`, 'success');
  };

  const whatsapp = (c) => api.whatsapp(c.phone, reminder(c)).catch((e) => toast(e.message, 'error'));

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  return (
    <div className="page">
      <div className="toolbar">
        <Tabs
          value={view}
          onChange={setView}
          tabs={[
            { id: 'skipped', label: `Skipped ${threshold}+ days`, count: groups.skipped.length },
            { id: 'today', label: 'Not paid today', count: groups.today.length },
            { id: 'all', label: 'All active', count: groups.all.length },
          ]}
        />
        <div className="grow" />
        <label className="row gap-sm">
          <span className="muted">Flag after</span>
          <input type="number" min={1} max={365} className="input sm" style={{ width: 70 }} value={threshold} onChange={(e) => saveThreshold(Number(e.target.value))} />
          <span className="muted">days</span>
        </label>
        {rows.length > 0 && view !== 'all' && (
          <button className="btn sm" onClick={copyAll}>
            <Icon name="copy" size={15} /> Copy all reminders
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title={view === 'all' ? 'No active customers' : 'Nobody to remind 🎉'} icon="check">
          {view === 'skipped' ? `No active customer has gone ${threshold} or more days without paying.` : view === 'today' ? 'Every active customer has paid today.' : null}
        </Empty>
      ) : (
        <div className="card no-pad">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Last payment</th>
                <th className="num">Days without payment</th>
                <th className="num">Target</th>
                <th style={{ width: 300 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const sev = c.paidToday ? 'ok' : c.daysWithout >= threshold * 2 ? 'bad' : c.daysWithout >= threshold ? 'warn' : 'neutral';
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="link strong" onClick={() => navigate('customer', { id: c.id })}>
                        {c.name}
                      </span>
                    </td>
                    <td>{c.phone || <span className="muted">—</span>}</td>
                    <td>{c.last_date ? `${fmtDate(c.last_date)} · ${money(c.last_amount)}` : <span className="muted">never paid</span>}</td>
                    <td className="num">
                      <span className={`pill ${sev}`}>{c.paidToday ? 'paid today' : `${c.daysWithout} day${c.daysWithout === 1 ? '' : 's'}`}</span>
                    </td>
                    <td className="num">{c.daily_target ? money(c.daily_target) : '—'}</td>
                    <td className="actions">
                      {!c.paidToday && (
                        <>
                          <button className="btn sm" onClick={() => copy(c)} title={reminder(c)}>
                            <Icon name="copy" size={14} /> Copy reminder
                          </button>
                          {c.phone && (
                            <button className="btn sm ghost" onClick={() => whatsapp(c)} title="Open WhatsApp with this message">
                              <Icon name="message" size={14} /> WhatsApp
                            </button>
                          )}
                        </>
                      )}
                      <button className="btn sm ghost" onClick={() => openQuickEntry({ customerId: c.id })}>
                        + Pay
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Edit the reminder text in Settings → Reminders. Inactive customers are not listed.</p>
    </div>
  );
}
