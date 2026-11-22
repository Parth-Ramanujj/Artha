import { BellRing, Check, Clock, MessageCircle, Plus, Trash2 } from 'lucide-react';
import type { ReminderRecord } from '../../services/api';
import { groupReminders } from '../../utils/reminders';
import type { useReminders } from './useReminders';
import './RemindersPanel.css';

export interface RemindersPanelDeal {
  id: string;
  title: string;
  phone: string;
}

export interface RemindersPanelProps {
  state: ReturnType<typeof useReminders>;
  deals: RemindersPanelDeal[];
  onAdd: () => void;
  onOpenChat: (phone: string) => void;
}

const REASON_LABEL: Record<ReminderRecord['reason'], string | null> = {
  manual: null,
  sequence_exhausted: 'Auto · no reply',
  customer_replied: 'Auto · replied',
};

const formatDue = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function RemindersPanel({ state, deals, onAdd, onOpenChat }: RemindersPanelProps) {
  const { reminders, loading, error, complete, snooze, remove } = state;
  const groups = groupReminders(reminders, new Date());
  const dealById = new Map(deals.map(d => [d.id, d]));

  const renderItem = (r: ReminderRecord, overdue: boolean) => {
    const deal = r.dealId ? dealById.get(r.dealId) : undefined;
    const reason = REASON_LABEL[r.reason];
    return (
      <li key={r.id} className={`reminder-item${overdue ? ' overdue' : ''}`}>
        <div className="reminder-main">
          <span className="reminder-title">{r.title}</span>
          <span className="reminder-meta">
            <Clock size={12} aria-hidden /> <time dateTime={r.dueAt}>{formatDue(r.dueAt)}</time>
            {r.assignedTo && r.assignedTo !== 'Unassigned' && <> · {r.assignedTo}</>}
            {deal && <> · {deal.title}</>}
            {reason && <span className="reminder-reason">{reason}</span>}
          </span>
          {r.notes && <span className="reminder-notes">{r.notes}</span>}
        </div>
        <div className="reminder-actions">
          {deal?.phone && (
            <button type="button" onClick={() => onOpenChat(deal.phone)} aria-label={`Open WhatsApp chat for ${r.title}`} title="Open chat">
              <MessageCircle size={14} aria-hidden />
            </button>
          )}
          <button type="button" onClick={() => void snooze(r.id)} aria-label={`Snooze ${r.title} to tomorrow`} title="Snooze to tomorrow 10:00">
            <Clock size={14} aria-hidden />
          </button>
          <button type="button" onClick={() => void complete(r.id)} aria-label={`Mark ${r.title} done`} title="Done">
            <Check size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm(`Delete reminder "${r.title}"?`)) void remove(r.id);
            }}
            aria-label={`Delete ${r.title}`}
            title="Delete"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      </li>
    );
  };

  const section = (label: string, items: ReminderRecord[], overdue = false) =>
    items.length > 0 && (
      <section className="reminder-group" aria-label={label}>
        <h4 className={overdue ? 'overdue' : undefined}>
          {label} <span className="reminder-count">{items.length}</span>
        </h4>
        <ul>{items.map(r => renderItem(r, overdue))}</ul>
      </section>
    );

  return (
    <section className="reminders-panel" aria-labelledby="reminders-panel-title">
      <header className="reminders-panel-header">
        <h3 id="reminders-panel-title">
          <BellRing size={16} aria-hidden /> Follow-up reminders
          {groups.overdue.length > 0 && <span className="reminder-count overdue">{groups.overdue.length} overdue</span>}
        </h3>
        <button type="button" className="btn-secondary" onClick={onAdd}>
          <Plus size={14} aria-hidden /> Add reminder
        </button>
      </header>
      {loading ? (
        <p className="reminders-empty">Loading…</p>
      ) : error ? (
        <p className="reminders-empty" role="alert">
          Reminders could not be loaded: {error}
        </p>
      ) : reminders.length === 0 ? (
        <p className="reminders-empty">No open reminders. Add one, or let a deal-stage follow-up rule raise them.</p>
      ) : (
        <div className="reminder-groups">
          {section('Overdue', groups.overdue, true)}
          {section('Today', groups.today)}
          {section('Upcoming', groups.upcoming)}
        </div>
      )}
    </section>
  );
}
