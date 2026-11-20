import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Copy, ExternalLink, FileCheck, Phone, PhoneCall, Plus, Reply, Trash2 } from 'lucide-react';
import { whatsappFormApi } from '../../services/api';
import type { MetaButtonType } from '../../types/messageStudio';
import { BUTTON_LABEL, BUTTON_LIMITS, type MetaTemplateButtonDraft } from '../../utils/metaTemplate';

const MENU: Array<{ type: MetaButtonType; icon: typeof Reply; help: string; marketingOnly?: boolean }> = [
  { type: 'QUICK_REPLY', icon: Reply, help: 'Customer taps it; the text comes back to you as their reply.' },
  { type: 'URL', icon: ExternalLink, help: 'Opens a website, e.g. your registration form.' },
  { type: 'VOICE_CALL', icon: PhoneCall, help: 'Starts a WhatsApp voice call to this business number.' },
  { type: 'PHONE_NUMBER', icon: Phone, help: 'Starts a normal phone call to your number.' },
  { type: 'COPY_CODE', icon: Copy, help: 'Copies an offer code, e.g. SAVE20.', marketingOnly: true },
  { type: 'FLOW', icon: FileCheck, help: 'Opens one of your published WhatsApp Forms.' },
];

const empty = (type: MetaButtonType): MetaTemplateButtonDraft => ({
  type,
  text: type === 'VOICE_CALL' ? 'Call on WhatsApp' : '',
  value: '',
  flowId: '',
  autoReply: '',
});

/** Edits a template's buttons the way Meta's builder does; quick replies can carry an auto-reply. */
export function MetaTemplateButtons({
  buttons,
  category,
  onChange,
}: {
  buttons: MetaTemplateButtonDraft[];
  category: 'MARKETING' | 'UTILITY';
  onChange: (buttons: MetaTemplateButtonDraft[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const usesFlow = buttons.some(b => b.type === 'FLOW');
  const forms = useQuery({ queryKey: ['whatsapp-forms'], queryFn: whatsappFormApi.list, enabled: usesFlow });
  const publishedForms = (forms.data ?? []).filter(f => f.status === 'published' && f.metaFlowId);

  const update = (i: number, patch: Partial<MetaTemplateButtonDraft>) =>
    onChange(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const used = (t: MetaButtonType) => buttons.filter(b => b.type === t).length;
  const canAdd = (t: MetaButtonType) =>
    buttons.length < 10 && used(t) < (BUTTON_LIMITS[t] ?? 10) && !(t === 'COPY_CODE' && category !== 'MARKETING');

  return (
    <section className="mt-card" aria-labelledby="mt-buttons-heading">
      <div className="mt-card-head">
        <h3 id="mt-buttons-heading" className="mt-card-title">
          Buttons <span className="mt-optional">· Optional</span>
        </h3>
      </div>
      <p className="mt-help">
        Create buttons that let customers respond to your message or take action. You can add up to ten buttons. If you
        add more than three, they appear in a list.
      </p>

      {buttons.map((b, i) => {
        const Icon = MENU.find(m => m.type === b.type)?.icon ?? Reply;
        return (
          <fieldset key={i} className="mt-button">
            <legend className="mt-button-head">
              <Icon size={14} aria-hidden="true" /> {BUTTON_LABEL[b.type]}
            </legend>
            <div className="mt-button-fields">
              {b.type !== 'COPY_CODE' && (
                <label className="ms-field">
                  <span className="ms-label">Button text</span>
                  <input
                    className="ms-input"
                    maxLength={25}
                    placeholder={b.type === 'URL' ? 'Register Now' : b.type === 'FLOW' ? 'Fill the form' : 'Know More'}
                    value={b.text}
                    onChange={e => update(i, { text: e.target.value })}
                  />
                  <span className="mt-counter">{b.text.length}/25</span>
                </label>
              )}
              {(b.type === 'URL' || b.type === 'PHONE_NUMBER' || b.type === 'COPY_CODE') && (
                <label className="ms-field">
                  <span className="ms-label">
                    {b.type === 'URL' ? 'Website URL' : b.type === 'PHONE_NUMBER' ? 'Phone number' : 'Offer code (sample)'}
                  </span>
                  <input
                    className="ms-input"
                    inputMode={b.type === 'PHONE_NUMBER' ? 'tel' : undefined}
                    placeholder={
                      b.type === 'URL' ? 'https://yourwebsite.com/register' : b.type === 'PHONE_NUMBER' ? '+919876543210' : 'SAVE20'
                    }
                    maxLength={b.type === 'COPY_CODE' ? 15 : 2000}
                    value={b.value}
                    onChange={e => update(i, { value: e.target.value.trim() })}
                  />
                </label>
              )}
              {b.type === 'FLOW' && (
                <label className="ms-field">
                  <span className="ms-label">WhatsApp form</span>
                  <select className="ms-input" value={b.flowId} onChange={e => update(i, { flowId: e.target.value })}>
                    <option value="">{forms.isLoading ? 'Loading forms…' : 'Choose a published form'}</option>
                    {publishedForms.map(f => (
                      <option key={f.id} value={f.metaFlowId!}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  {!forms.isLoading && publishedForms.length === 0 && (
                    <span className="mt-help">No published form yet. Publish one in WhatsApp Forms first.</span>
                  )}
                </label>
              )}
              <button
                className="ms-icon-btn"
                aria-label={`Remove button ${i + 1}`}
                onClick={() => onChange(buttons.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <span className="mt-help">{MENU.find(m => m.type === b.type)?.help}</span>
            {b.type === 'QUICK_REPLY' && (
              <label className="ms-field">
                <span className="ms-label">
                  Auto-reply when tapped <span className="mt-optional">· Optional</span>
                </span>
                <textarea
                  className="ms-input"
                  rows={2}
                  maxLength={4096}
                  placeholder={`What should we send back when someone taps "${b.text || 'this button'}"?`}
                  value={b.autoReply}
                  onChange={e => update(i, { autoReply: e.target.value })}
                />
              </label>
            )}
          </fieldset>
        );
      })}

      <div className="mt-menu-wrap">
        <button
          className="btn btn-secondary"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={buttons.length >= 10}
          onClick={() => setMenuOpen(o => !o)}
        >
          <Plus size={15} /> Add button <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <ul className="mt-menu" role="menu">
            {MENU.filter(m => !m.marketingOnly || category === 'MARKETING').map(m => (
              <li key={m.type} role="none">
                <button
                  role="menuitem"
                  className="mt-menu-item"
                  disabled={!canAdd(m.type)}
                  title={canAdd(m.type) ? m.help : 'Limit reached for this button type'}
                  onClick={() => {
                    onChange([...buttons, empty(m.type)]);
                    setMenuOpen(false);
                  }}
                >
                  <m.icon size={15} aria-hidden="true" /> {BUTTON_LABEL[m.type]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
