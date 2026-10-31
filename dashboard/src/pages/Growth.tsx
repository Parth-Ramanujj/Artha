import { useCallback, useEffect, useState } from 'react';
import { growthApi } from '../services/api';
import type { GrowthSettings, GrowthSettingsInput } from '../types/growth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import { LinksTab } from '../components/growth/LinksTab';
import { GreetingsTab } from '../components/growth/GreetingsTab';
import { SummaryTab } from '../components/growth/SummaryTab';
import { ComplianceTab } from '../components/growth/ComplianceTab';
import { VoiceTab } from '../components/growth/VoiceTab';
import './SalesAgent.css';

const TABS = [
  { id: 'links', label: 'QR & website widget' },
  { id: 'greetings', label: 'Greetings' },
  { id: 'summary', label: 'Daily summary' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'voice', label: 'Voice notes' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export type SaveSettings = (patch: GrowthSettingsInput) => Promise<void>;

export function Growth() {
  useDocumentTitle('Growth');
  const [tab, setTab] = useState<TabId>('links');
  const [settings, setSettings] = useState<GrowthSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    growthApi
      .settings()
      .then(setSettings)
      .catch((err: Error) => setError(err.message));
  }, []);

  // Tabs show their own error/notice; this just keeps the shared settings row current.
  const save = useCallback<SaveSettings>(async patch => setSettings(await growthApi.saveSettings(patch)), []);

  return (
    <div className="sa-page">
      <PageHeader
        title="Growth"
        subtitle="Bring in new chats, keep customers coming back, and stay safe from WhatsApp bans"
      />
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}

      <div className="sa-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'sa-tab active' : 'sa-tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'links' && <LinksTab />}
        {tab === 'compliance' && <ComplianceTab settings={settings} onSave={save} />}
        {settings && tab === 'greetings' && <GreetingsTab settings={settings} onSave={save} />}
        {settings && tab === 'summary' && <SummaryTab settings={settings} onSave={save} />}
        {settings && tab === 'voice' && <VoiceTab settings={settings} onSave={save} />}
        {!settings && !error && tab !== 'links' && tab !== 'compliance' && <p className="sa-help">Loading…</p>}
      </div>
    </div>
  );
}
