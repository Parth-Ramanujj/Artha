import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2, MessageCircle, X } from 'lucide-react';
import { aiCallingApi, type AiCall } from '../../services/api';
import { useToast } from '../Toast';
import { Pill, StatusPill } from './shared';
import { errorText, formatDuration, formatWhen, SENTIMENT_META } from './callMeta';

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
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const x = call.extracted ?? {};
  const sentiment = call.sentiment ? SENTIMENT_META[call.sentiment] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sendWhatsapp = async () => {
    setBusy(true);
    try {
      onChanged(await aiCallingApi.sendWhatsapp(call.id));
      toast.success(t('aiCalling.drawer.sent'));
    } catch (err) {
      toast.error(errorText(err, t('aiCalling.drawer.sendFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={t('aiCalling.drawer.dialog')}
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
              {call.channel === 'browser' ? t('aiCalling.drawer.browserCall') : call.phone} ·{' '}
              {formatWhen(call.answeredAt ?? call.createdAt)} · {formatDuration(call.durationSeconds)}
            </div>
          </div>
          <button className="btn-secondary" onClick={onClose} aria-label={t('aiCalling.drawer.close')}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0' }}>
          <StatusPill call={call} />
          {call.isVerifiedLead && (
            <Pill color="#22c55e">
              <BadgeCheck size={13} /> {t('aiCalling.drawer.verifiedLead')}
            </Pill>
          )}
          {call.outcome && <Pill color="#3b82f6">{t(`aiCalling.outcome.${call.outcome}`)}</Pill>}
          {sentiment && (
            <Pill color={sentiment.color}>
              {sentiment.emoji} {t(`aiCalling.sentiment.${call.sentiment}`)}
            </Pill>
          )}
          {call.leadTemperature && <Pill color="#ef4444">{t(`aiCalling.leadTemp.${call.leadTemperature}`)}</Pill>}
          {call.language && (
            <Pill color="#64748b">
              {t(call.language === 'hi-IN' ? 'aiCalling.language.hi' : 'aiCalling.language.gu')}
            </Pill>
          )}
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
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t('aiCalling.drawer.summary')}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{call.summary}</div>
            <div style={{ marginTop: 8 }}>
              <Fact label={t('aiCalling.drawer.name')} value={x.name} />
              <Fact label={t('aiCalling.drawer.need')} value={x.need} />
              <Fact label={t('aiCalling.drawer.place')} value={[x.city, x.pincode].filter(Boolean).join(' · ')} />
              <Fact label={t('aiCalling.drawer.callback')} value={x.callbackTime} />
              <Fact label={t('aiCalling.drawer.notes')} value={x.notes} />
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
            {call.whatsappSentAt
              ? t('aiCalling.drawer.whatsappSent', { when: formatWhen(call.whatsappSentAt) })
              : t('aiCalling.drawer.sendWhatsapp')}
          </button>
        )}

        <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 8px' }}>{t('aiCalling.drawer.conversation')}</div>
        {!call.transcript?.length ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('aiCalling.drawer.noConversation')}</div>
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
                  {turn.role === 'agent' ? t('aiCalling.drawer.agent') : t('aiCalling.drawer.customer')} ·{' '}
                  {new Date(turn.at).toLocaleTimeString(i18n.language, {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  {turn.interrupted ? ` · ${t('aiCalling.drawer.interrupted')}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
