import { useEffect, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  Copy,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { aiCallingApi, type AiCallingSetup } from '../../services/api';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../Toast';
import { errorText, panel } from './callMeta';

type Status = boolean | null;

const link = (href: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {href.replace(/^https:\/\//, '')}
  </a>
);

/** A line to paste somewhere, with a copy button. */
function CopyLine({ text }: { text: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('aiCalling.setup.copied'));
    } catch {
      toast.error(t('aiCalling.setup.copyFailed'));
    }
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' }}>
      <code
        style={{
          flex: '0 1 auto',
          padding: '4px 8px',
          borderRadius: 6,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          fontSize: 12.5,
          wordBreak: 'break-all',
        }}
      >
        {text}
      </code>
      <button
        className="btn-secondary"
        onClick={() => void copy()}
        title={t('aiCalling.setup.copy')}
        aria-label={t('aiCalling.setup.copyText', { text })}
      >
        <Copy size={13} />
      </button>
    </div>
  );
}

function Step({
  n,
  ok,
  title,
  why,
  children,
}: {
  n: number;
  ok: Status;
  title: string;
  why: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const color = ok ? '#22c55e' : ok === false ? '#f59e0b' : 'var(--text-muted)';
  const Icon = ok ? CheckCircle2 : ok === false ? CircleAlert : CircleHelp;
  return (
    <li
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <Icon
        size={18}
        color={color}
        style={{ flexShrink: 0, marginTop: 1 }}
        aria-label={t(ok ? 'aiCalling.setup.done' : ok === false ? 'aiCalling.setup.todo' : 'aiCalling.setup.unknown')}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
          {n}. {title}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>{why}</div>
        {!ok && children && <div style={{ fontSize: 13, marginTop: 6 }}>{children}</div>}
      </div>
    </li>
  );
}

/** Step-by-step guide to everything needed before the agent can place real phone calls. */
export function SetupPanel({ setup, onChanged }: { setup: AiCallingSetup; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAdmin } = useRole();
  const [url, setUrl] = useState(setup.publicUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(!setup.readyForPhoneCalls);

  useEffect(() => setUrl(setup.publicUrl ?? ''), [setup.publicUrl]);
  useEffect(() => {
    if (!setup.readyForPhoneCalls) setOpen(true);
  }, [setup.readyForPhoneCalls]);

  const save = async () => {
    setSaving(true);
    try {
      await aiCallingApi.setPublicUrl(url.trim());
      toast.success(t('aiCalling.setup.saved'));
      onChanged();
    } catch (err) {
      toast.error(errorText(err, t('aiCalling.setup.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const trial = setup.twilioAccountType === 'Trial';
  const port = setup.serverPort || 2785;
  const canTest = setup.sarvamKey && setup.groqKey;
  const missingKeys = [
    !setup.sarvamKey && 'SARVAM_API_KEY',
    !setup.groqKey && 'GROQ_API_KEY',
    !setup.twilioConfigured && 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER',
  ].filter(Boolean);
  const twilioOk: Status = !setup.twilioConfigured
    ? false
    : setup.twilioError
      ? false
      : setup.twilioNumberOwned === false
        ? false
        : setup.twilioNumberOwned;

  const toggle = (
    <button className="btn-secondary" onClick={() => setOpen(o => !o)} aria-expanded={open}>
      {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {t('aiCalling.setup.guide')}
    </button>
  );

  if (setup.readyForPhoneCalls && !open) {
    return (
      <div
        style={{
          ...panel,
          padding: '10px 14px',
          marginBottom: 20,
          borderColor: '#22c55e88',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <CheckCircle2 size={17} color="#22c55e" />
        <b style={{ flex: 1 }}>{t('aiCalling.setup.ready')}</b>
        {toggle}
      </div>
    );
  }

  return (
    <div style={{ ...panel, marginBottom: 20, borderColor: setup.readyForPhoneCalls ? '#22c55e88' : '#f59e0b88' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <b style={{ flex: 1 }}>
          {setup.readyForPhoneCalls ? t('aiCalling.setup.ready') : t('aiCalling.setup.title', { steps: trial ? 6 : 5 })}
        </b>
        {setup.readyForPhoneCalls && toggle}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {canTest ? (
          <Trans i18nKey="aiCalling.setup.canTest" components={{ b: <b /> }} />
        ) : (
          t('aiCalling.setup.cannotTest')
        )}
        {missingKeys.length > 0 && <> {t('aiCalling.setup.missingKeys', { keys: missingKeys.join(', ') })}</>}
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <Step
          n={1}
          ok={setup.sarvamKey}
          title={t('aiCalling.setup.sarvam.title')}
          why={t('aiCalling.setup.sarvam.why')}
        >
          <Trans i18nKey="aiCalling.setup.sarvam.how" components={{ link: link('https://dashboard.sarvam.ai') }} />
          <CopyLine text="SARVAM_API_KEY=your-key" />
        </Step>
        <Step n={2} ok={setup.groqKey} title={t('aiCalling.setup.groq.title')} why={t('aiCalling.setup.groq.why')}>
          <Trans i18nKey="aiCalling.setup.groq.how" components={{ link: link('https://console.groq.com/keys') }} />
          <CopyLine text="GROQ_API_KEY=your-key" />
        </Step>
        <Step
          n={3}
          ok={twilioOk}
          title={
            setup.twilioAccountType
              ? t('aiCalling.setup.twilio.titleWithType', { type: setup.twilioAccountType })
              : t('aiCalling.setup.twilio.title')
          }
          why={t('aiCalling.setup.twilio.why')}
        >
          {setup.twilioError && (
            <div style={{ color: '#ef4444', marginBottom: 6 }}>
              {t('aiCalling.setup.twilio.says', { error: setup.twilioError })}
            </div>
          )}
          {setup.twilioNumberOwned === false && (
            <div style={{ color: '#f59e0b', marginBottom: 6 }}>{t('aiCalling.setup.twilio.numberNotOwned')}</div>
          )}
          {setup.twilioNumberOwned === null && trial && setup.twilioConfigured && !setup.twilioError && (
            <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>
              {t('aiCalling.setup.twilio.trialNoCheck')}
            </div>
          )}
          <Trans i18nKey="aiCalling.setup.twilio.how" components={{ link: link('https://console.twilio.com') }} />
          <CopyLine text="TWILIO_ACCOUNT_SID=AC..." />
          <CopyLine text="TWILIO_AUTH_TOKEN=your-token" />
          <CopyLine text="TWILIO_PHONE_NUMBER=+1..." />
          {t('aiCalling.setup.twilio.numberFormat')}
        </Step>
        {trial && (
          <Step
            n={4}
            ok={setup.twilioVerifiedCallerIds === null ? null : setup.twilioVerifiedCallerIds > 0}
            title={t('aiCalling.setup.verify.title')}
            why={t('aiCalling.setup.verify.why')}
          >
            {t('aiCalling.setup.verify.how')}
          </Step>
        )}
        <Step
          n={trial ? 5 : 4}
          ok={setup.publicUrlReachable}
          title={t('aiCalling.setup.publicUrl.title')}
          why={t('aiCalling.setup.publicUrl.why')}
        >
          {t('aiCalling.setup.publicUrl.run')}
          <CopyLine text={`cloudflared tunnel --url http://localhost:${port}`} />
          {t(isAdmin ? 'aiCalling.setup.publicUrl.pasteAdmin' : 'aiCalling.setup.publicUrl.paste')}
        </Step>
        <Step
          n={trial ? 6 : 5}
          ok={null}
          title={t('aiCalling.setup.testCall.title')}
          why={t('aiCalling.setup.testCall.why')}
        >
          <Trans i18nKey="aiCalling.setup.testCall.how" components={{ b: <b /> }} />
        </Step>
      </ol>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="https://your-tunnel.trycloudflare.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          style={{ flex: '1 1 280px', maxWidth: 460 }}
          aria-label={t('aiCalling.setup.urlLabel')}
          readOnly={!isAdmin}
        />
        {isAdmin ? (
          <button className="btn-secondary" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {t('aiCalling.save')}
          </button>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{t('aiCalling.setup.askAdmin')}</span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: 12,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}
      >
        <span>{t('aiCalling.setup.restartHint')}</span>
        <button className="btn-secondary" onClick={onChanged}>
          <RefreshCw size={14} /> {t('aiCalling.setup.recheck')}
        </button>
      </div>
    </div>
  );
}
