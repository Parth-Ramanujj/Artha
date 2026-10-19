import { useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, Save } from 'lucide-react';
import { aiCallingApi, type AiCallingSetup } from '../../services/api';
import { useToast } from '../Toast';
import { errorText, panel } from './callMeta';

function Item({ ok, title, hint }: { ok: boolean | null; title: string; hint?: string }) {
  const color = ok ? '#22c55e' : ok === false ? '#f59e0b' : 'var(--text-muted)';
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0' }}>
      {ok ? <CheckCircle2 size={17} color={color} /> : <CircleAlert size={17} color={color} />}
      <div>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
        {hint && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>{hint}</div>}
      </div>
    </li>
  );
}

/** What is still missing before the agent can place real phone calls, with the fix for each step. */
export function SetupPanel({ setup, onChanged }: { setup: AiCallingSetup; onChanged: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState(setup.publicUrl ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await aiCallingApi.setPublicUrl(url);
      toast.success('Public URL saved');
      onChanged();
    } catch (err) {
      toast.error(errorText(err, 'Could not save the URL'));
    } finally {
      setSaving(false);
    }
  };

  const trial = setup.twilioAccountType === 'Trial';
  return (
    <div style={{ ...panel, marginBottom: 20, borderColor: setup.readyForPhoneCalls ? 'var(--border)' : '#f59e0b88' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {setup.readyForPhoneCalls ? 'Ready for phone calls' : 'Finish setup to place real phone calls'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
        You can already talk to the agent from the <b>Test call</b> tab. Phone calls need these steps:
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <Item
          ok={setup.sarvamKey && setup.groqKey}
          title="Voice and AI keys"
          hint={
            !setup.sarvamKey ? 'Add SARVAM_API_KEY to .env' : !setup.groqKey ? 'Add GROQ_API_KEY to .env' : undefined
          }
        />
        <Item
          ok={setup.twilioConfigured && !setup.twilioError}
          title={`Twilio account${setup.twilioAccountType ? ` (${setup.twilioAccountType})` : ''}`}
          hint={
            setup.twilioError ??
            (!setup.twilioConfigured
              ? 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER to .env'
              : undefined)
          }
        />
        <Item
          ok={setup.twilioNumberOwned}
          title="Twilio phone number"
          hint={
            setup.twilioNumberOwned === false
              ? 'The number in TWILIO_PHONE_NUMBER is not on this Twilio account. In the Twilio console get a phone number (trial accounts get one free) and put it in .env.'
              : undefined
          }
        />
        {trial && (
          <Item
            ok={(setup.twilioVerifiedCallerIds ?? 0) > 0}
            title="Verified numbers (trial accounts only)"
            hint="A trial account can only call numbers you verified in Twilio → Phone Numbers → Verified Caller IDs, and plays a short trial notice first. Upgrade to call anyone."
          />
        )}
        <Item
          ok={setup.publicUrlReachable}
          title="Public URL (tunnel) so Twilio can reach this server"
          hint={
            setup.publicUrlReachable
              ? (setup.publicUrl ?? undefined)
              : 'Run: cloudflared tunnel --url http://localhost:2785 and paste the https://…trycloudflare.com address below.'
          }
        />
      </ul>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="https://your-tunnel.trycloudflare.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          style={{ flex: '1 1 280px', maxWidth: 460 }}
          aria-label="Public URL"
        />
        <button className="btn-secondary" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
        </button>
      </div>
    </div>
  );
}
