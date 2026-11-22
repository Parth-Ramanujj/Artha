import { useState, type FormEvent } from 'react';
import { Modal } from '../Modal';
import { fromLocalInputValue, isServerDealId, snoozeUntil, toLocalInputValue } from '../../utils/reminders';
import type { NewReminder } from './useReminders';

export interface ReminderDealOption {
  id: string;
  title: string;
  assignee: string;
}

export interface ReminderFormProps {
  deals: ReminderDealOption[];
  initialDealId?: string;
  onSubmit: (data: NewReminder) => Promise<boolean>;
  onClose: () => void;
}

export function ReminderForm({ deals, initialDealId, onSubmit, onClose }: ReminderFormProps) {
  // Only deals saved on the server can carry a reminder; browser-only demo deals are left out.
  const linkable = deals.filter(d => isServerDealId(d.id));
  const initialDeal = linkable.find(d => d.id === initialDealId);
  const [title, setTitle] = useState(initialDeal ? `Follow up: ${initialDeal.title}` : '');
  const [dueAt, setDueAt] = useState(toLocalInputValue(snoozeUntil(new Date())));
  const [dealId, setDealId] = useState(initialDeal?.id ?? '');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const dueIso = fromLocalInputValue(dueAt);
  const canSave = title.trim() !== '' && dueIso !== null && !saving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !dueIso) return;
    setSaving(true);
    const ok = await onSubmit({
      title: title.trim(),
      dueAt: dueIso,
      ...(dealId ? { dealId } : {}),
      ...(assignedTo.trim() ? { assignedTo: assignedTo.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open title="New follow-up reminder" onClose={onClose}>
      <form className="reminder-form" onSubmit={submit}>
        <label>
          What to do *
          <input
            type="text"
            value={title}
            maxLength={200}
            required
            placeholder="e.g. Call Rajesh about the proposal"
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <div className="reminder-form-row">
          <label>
            When *
            <input type="datetime-local" value={dueAt} required onChange={e => setDueAt(e.target.value)} />
          </label>
          <label>
            Deal (optional)
            <select value={dealId} onChange={e => setDealId(e.target.value)}>
              <option value="">— No deal —</option>
              {linkable.map(d => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Assigned to
          <input
            type="text"
            value={assignedTo}
            maxLength={100}
            placeholder={dealId ? 'Deal owner by default' : 'Unassigned'}
            onChange={e => setAssignedTo(e.target.value)}
          />
        </label>
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
        <div className="reminder-form-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!canSave}>
            {saving ? 'Saving…' : 'Add reminder'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
