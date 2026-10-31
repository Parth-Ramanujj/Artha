import type { GrowthSettings } from '../../types/growth';
import type { SaveSettings } from '../../pages/Growth';
import { useSaver } from './useSaver';

/** Turn voice notes into text and act on them. */
export function VoiceTab({ settings, onSave }: { settings: GrowthSettings; onSave: SaveSettings }) {
  const { busy, run, messages } = useSaver();

  return (
    <section className="sa-panel sa-form">
      {messages}
      <fieldset>
        <legend>Voice notes</legend>
        <label className="sa-check">
          <input
            type="checkbox"
            disabled={busy}
            checked={settings.voiceActionsEnabled}
            onChange={e =>
              void run(async () => {
                await onSave({ voiceActionsEnabled: e.target.checked });
                return e.target.checked ? 'Voice notes will be turned into text.' : 'Turned off.';
              })
            }
          />
          Turn customers' voice notes into text and act on them
        </label>
        <ul className="sa-list sa-help">
          <li>The words appear in the chat, so your team can read instead of listening.</li>
          <li>Your AI replies, workflows and lead capture answer voice notes just like typed messages.</li>
          <li>
            Chats get tagged <strong>voice</strong>; a complaint is also tagged <strong>complaint</strong> and moved to
            Pending for a person to handle; a booking request is tagged <strong>booking</strong>.
          </li>
        </ul>
        <p className="sa-help">Uses your Groq AI key. Very long voice notes may not be transcribed.</p>
      </fieldset>
    </section>
  );
}
