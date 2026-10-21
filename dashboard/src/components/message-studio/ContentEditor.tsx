import { useState } from 'react';
import type { ReadinessIssue, StudioContent, StudioKind } from '../../types/messageStudio';
import { LIMITS, bodyLimit, issuesFor } from '../../utils/messageStudio';
import { FieldIssues, OptionalSection, TextField, VariableChips } from './fields';
import { MediaField } from './MediaField';
import { TemplateFields } from './TemplateFields';

interface ContentEditorProps {
  kind: StudioKind;
  content: StudioContent;
  onChange: (patch: Partial<StudioContent>) => void;
  issues: ReadinessIssue[];
  sessionId: string;
  cloudApi: boolean;
}

const BODY_LABEL: Partial<Record<StudioKind, string>> = {
  image: 'Caption',
  video: 'Caption',
  document: 'Caption',
  products: 'Intro text',
};

/** Left panel: the words, file and details of the message. */
export function ContentEditor({ kind, content, onChange, issues, sessionId, cloudApi }: ContentEditorProps) {
  const hasHeaderFooter =
    kind === 'buttons' || kind === 'list' || (kind === 'products' && content.productLayout === 'native');
  const [showExtras, setShowExtras] = useState(Boolean(content.header || content.footer || content.url));
  const isMedia = kind === 'image' || kind === 'video' || kind === 'document' || kind === 'audio' || kind === 'sticker';
  // Audio and stickers are sent as the file alone, so there is no caption to write.
  const mediaOnly = kind === 'audio' || kind === 'sticker';
  const bodyRequired =
    kind === 'text' ||
    kind === 'buttons' ||
    kind === 'list' ||
    kind === 'address' ||
    kind === 'location_request' ||
    kind === 'flow' ||
    (kind === 'products' && content.productLayout === 'native');

  if (kind === 'reaction') {
    const emoji = content.reaction?.emoji ?? '';
    return (
      <div className="ms-stack">
        <TextField
          label="Emoji"
          required
          max={16}
          value={emoji}
          onChange={v => onChange({ reaction: { emoji: v } })}
          hint="Put one emoji on the customer’s message. It is sent from a workflow after that message arrives."
          issues={issuesFor(issues, 'reaction.emoji')}
        />
        <div className="ms-chips" aria-label="Quick emoji">
          {['👍', '❤️', '😂', '🙏', '✅'].map(e => (
            <button
              key={e}
              type="button"
              className="ms-chip ms-chip-btn"
              onClick={() => onChange({ reaction: { emoji: e } })}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'template') {
    return (
      <TemplateFields content={content} onChange={onChange} issues={issues} sessionId={sessionId} cloudApi={cloudApi} />
    );
  }

  if (kind === 'location') {
    return <LocationFields content={content} onChange={onChange} issues={issues} />;
  }

  if (kind === 'flow') {
    const f = content.flow ?? { id: '', cta: 'Start', screen: '' };
    const body = content.text ?? '';
    return (
      <div className="ms-stack">
        <TextField
          label="Message above the button"
          required
          multiline
          rows={4}
          max={bodyLimit(kind, content)}
          value={body}
          onChange={v => onChange({ text: v })}
          issues={issuesFor(issues, 'text')}
        />
        <TextField
          label="Flow ID"
          required
          inputMode="numeric"
          value={f.id}
          onChange={v => onChange({ flow: { ...f, id: v.trim() } })}
          hint="The Flow ID from Meta Business Manager (WhatsApp Manager → Flows). Digits only."
          issues={issuesFor(issues, 'flow.id')}
        />
        <TextField
          label="Button text"
          required
          max={20}
          value={f.cta}
          onChange={v => onChange({ flow: { ...f, cta: v } })}
          issues={issuesFor(issues, 'flow.cta')}
        />
        <TextField
          label="First screen ID"
          required
          value={f.screen}
          onChange={v => onChange({ flow: { ...f, screen: v.trim() } })}
          hint="The screen the Flow opens on, from its JSON in Meta."
          issues={issuesFor(issues, 'flow.screen')}
        />
        <FieldIssues issues={issuesFor(issues, 'flow').filter(i => i.field === 'flow')} />
      </div>
    );
  }

  if (kind === 'address') {
    return (
      <div className="ms-stack">
        <TextField
          label="Message above the form"
          required
          multiline
          rows={4}
          max={bodyLimit(kind, content)}
          value={content.text ?? ''}
          onChange={v => onChange({ text: v })}
          issues={issuesFor(issues, 'text')}
        />
        <TextField
          label="Country code (ISO)"
          placeholder="IN"
          max={2}
          value={content.addressCountry ?? ''}
          onChange={v => onChange({ addressCountry: v.toUpperCase() })}
          hint="Two letters, like IN for India. The address form is for this country."
          issues={issuesFor(issues, 'addressCountry')}
        />
      </div>
    );
  }

  if (kind === 'contact') {
    const contact = content.contact ?? { name: '', phone: '' };
    return (
      <div className="ms-stack">
        <TextField
          label="Contact name"
          required
          max={100}
          value={contact.name}
          onChange={v => onChange({ contact: { ...contact, name: v } })}
          issues={issuesFor(issues, 'contact.name')}
        />
        <TextField
          label="Phone number"
          required
          type="tel"
          inputMode="tel"
          placeholder="+91 98765 43210"
          value={contact.phone}
          onChange={v => onChange({ contact: { ...contact, phone: v } })}
          hint="Include the country code."
          issues={issuesFor(issues, 'contact.phone')}
        />
      </div>
    );
  }

  const text = content.text ?? '';
  return (
    <div className="ms-stack">
      {isMedia && (
        <MediaField
          kind={kind}
          media={content.media}
          onChange={media => onChange({ media })}
          issues={issuesFor(issues, 'media')}
        />
      )}

      {!mediaOnly && (
        <>
          <TextField
            label={BODY_LABEL[kind] ?? 'Message text'}
            required={bodyRequired}
            multiline
            rows={kind === 'text' ? 6 : 4}
            max={bodyLimit(kind, content)}
            placeholder={kind === 'products' ? 'Optional — e.g. “Our picks for you”' : 'Type your message…'}
            value={text}
            onChange={v => onChange({ text: v })}
            hint={
              <>Formatting: *bold*, _italic_, ~strike~. Variables are filled in when an automation sends the message.</>
            }
            issues={issuesFor(issues, 'text')}
          />
          <VariableChips
            onInsert={token => onChange({ text: `${text}${text && !text.endsWith(' ') ? ' ' : ''}${token}` })}
          />
        </>
      )}

      {(hasHeaderFooter || kind === 'text') && (
        <OptionalSection
          title={kind === 'text' ? 'Add a link' : 'Add a header or footer'}
          open={showExtras}
          onToggle={() => setShowExtras(o => !o)}
        >
          {kind === 'text' ? (
            <TextField
              label="Link (https)"
              type="url"
              inputMode="url"
              placeholder="https://your-shop.com"
              value={content.url ?? ''}
              onChange={v => onChange({ url: v })}
              hint="Sent at the end of the message."
              issues={issuesFor(issues, 'url')}
            />
          ) : (
            <>
              <TextField
                label="Header"
                required={
                  kind === 'products' && content.productLayout === 'native' && (content.products?.length ?? 0) > 1
                }
                max={LIMITS.header}
                value={content.header ?? ''}
                onChange={v => onChange({ header: v })}
                issues={issuesFor(issues, 'header')}
              />
              <TextField
                label="Footer"
                max={LIMITS.footer}
                value={content.footer ?? ''}
                onChange={v => onChange({ footer: v })}
                hint="Small grey text under the message."
                issues={issuesFor(issues, 'footer')}
              />
            </>
          )}
        </OptionalSection>
      )}
    </div>
  );
}

function FieldIssuesFor({ issues, field, exclude }: { issues: ReadinessIssue[]; field: string; exclude: string[] }) {
  const list = issuesFor(issues, field).filter(i => !exclude.includes(i.field));
  if (list.length === 0) return null;
  return (
    <ul className="ms-field-issues">
      {list.map((i, n) => (
        <li key={n} className={i.severity === 'error' ? 'ms-field-error' : 'ms-field-warning'}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

function LocationFields({ content, onChange, issues }: Pick<ContentEditorProps, 'content' | 'onChange' | 'issues'>) {
  const loc = content.location ?? { latitude: 0, longitude: 0 };
  // Typed text stays as typed ("23.", "-"); the number is stored once it parses.
  const [lat, setLat] = useState(loc.latitude ? String(loc.latitude) : '');
  const [lng, setLng] = useState(loc.longitude ? String(loc.longitude) : '');
  const parse = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? Number.NaN : Number(v));
  return (
    <div className="ms-stack">
      <div className="ms-form-grid">
        <TextField
          label="Latitude"
          required
          inputMode="decimal"
          placeholder="23.0225"
          value={lat}
          onChange={v => {
            setLat(v);
            onChange({ location: { ...loc, latitude: parse(v) } });
          }}
          issues={issuesFor(issues, 'location.latitude')}
        />
        <TextField
          label="Longitude"
          required
          inputMode="decimal"
          placeholder="72.5714"
          value={lng}
          onChange={v => {
            setLng(v);
            onChange({ location: { ...loc, longitude: parse(v) } });
          }}
          issues={issuesFor(issues, 'location.longitude')}
        />
      </div>
      <span className="ms-hint">Tip: right-click your shop in Google Maps to copy its latitude and longitude.</span>
      <TextField
        label="Place name"
        max={100}
        value={loc.name ?? ''}
        onChange={v => onChange({ location: { ...loc, name: v } })}
      />
      <TextField
        label="Address"
        max={200}
        value={loc.address ?? ''}
        onChange={v => onChange({ location: { ...loc, address: v } })}
      />
      <FieldIssuesFor issues={issues} field="location" exclude={['location.latitude', 'location.longitude']} />
    </div>
  );
}
