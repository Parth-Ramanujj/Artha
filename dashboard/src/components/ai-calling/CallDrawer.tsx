import { useState } from 'react';
import { BadgeCheck, Loader2, MessageCircle, X } from 'lucide-react';
import { aiCallingApi, type AiCall } from '../../services/api';
import { useToast } from '../Toast';
import { Pill, StatusPill } from './shared';
import { errorText, formatDuration, formatWhen, OUTCOME_LABEL, SENTIMENT_META } from './callMeta';

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13.5, padding: '3px 0' }}>
      <span style={{ color: 'var(--text-secondary)', minWidth: 110 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/** Everything about one call: what was said, what the AI concluded, and the follow-up. */
export function CallDrawer({
  call,
  onClose,
  onChanged,
}: {
  call: AiCall;
  onClose: () => void;
  onChanged: (c: AiCall) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const x = call.extracted ?? {};
  const sentiment = call.sentiment ? SENTIMENT_META[call.sentiment] : null;

  const sendWhatsapp = async () => {
    setBusy(true);
    try {
      onChanged(await aiCallingApi.sendWhatsapp(call.id));
      toast.success('WhatsApp message sent');
    } catch (err) {
      toast.error(errorText(err, 'Could not send the WhatsApp message'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Call details"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          height: '100%',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{call.contactName || x.name || call.phone}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {call.channel === 'browser' ? 'Browser test call' : call.phone} ·{' '}
              {formatWhen(call.answeredAt ?? call.createdAt)} · {formatDuration(call.durationSeconds)}
            </div>
          </div>
          <button className="btn-secondary" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0' }}>
          <StatusPill call={call} />
          {call.isVerifiedLead && (
            <Pill color="#22c55e">
              <BadgeCheck size={13} /> Verified lead
            </Pill>
          )}
          {call.outcome && <Pill color="#3b82f6">{OUTCOME_LABEL[call.outcome]}</Pill>}
          {sentiment && (
            <Pill color={sentiment.color}>
              {sentiment.emoji} {sentiment.label}
            </Pill>
          )}
          {call.leadTemperature && <Pill color="#ef4444">{call.leadTemperature.toUpperCase()}</Pill>}
          {call.language && <Pill color="#64748b">{call.language === 'hi-IN' ? 'Hindi' : 'Gujarati'}</Pill>}
        </div>

        {call.error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{call.error}</div>}

        {call.summary && (
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Summary</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{call.summary}</div>
            <div style={{ marginTop: 8 }}>
              <Fact label="Name" value={x.name} />
              <Fact label="Need" value={x.need} />
              <Fact label="City / pincode" value={[x.city, x.pincode].filter(Boolean).join(' · ')} />
              <Fact label="Call back" value={x.callbackTime} />
              <Fact label="Notes" value={x.notes} />
            </div>
          </div>
        )}

        {call.channel === 'phone' && call.isVerifiedLead && (
          <button
            className="btn-primary"
            disabled={busy || Boolean(call.whatsappSentAt)}
            onClick={() => void sendWhatsapp()}
            style={{ marginBottom: 16 }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}{' '}
            {call.whatsappSentAt ? `WhatsApp sent ${formatWhen(call.whatsappSentAt)}` : 'Send WhatsApp follow-up'}
          </button>
        )}

        <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 8px' }}>Conversation</div>
        {!call.transcript?.length ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No conversation recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {call.transcript.map((turn, i) => (
              <div key={i} style={{ alignSelf: turn.role === 'agent' ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 12,
                    fontSize: 14,
                    lineHeight: 1.45,
                    background: turn.role === 'agent' ? 'var(--bg-secondary)' : '#25d36622',
                    border: '1px solid var(--border)',
                  }}
                >
                  {turn.text}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                    textAlign: turn.role === 'agent' ? 'left' : 'right',
                  }}
                >
                  {turn.role === 'agent' ? 'AI agent' : 'Customer'} ·{' '}
                  {new Date(turn.at).toLocaleTimeString('en-IN', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  {turn.interrupted ? ' · interrupted' : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
