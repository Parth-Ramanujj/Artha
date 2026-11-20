import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Megaphone, PhoneCall, ReceiptIndianRupee, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { sessionApi } from '../services/api';
import { AdsTab } from '../components/wa-tools/AdsTab';
import { CallsTab } from '../components/wa-tools/CallsTab';
import { InvoicesTab } from '../components/wa-tools/InvoicesTab';
import './WaTools.css';

const TABS = [
  { id: 'ads', label: 'Ad leads', icon: Megaphone },
  { id: 'calls', label: 'WhatsApp calls', icon: PhoneCall },
  { id: 'invoices', label: 'Invoices', icon: ReceiptIndianRupee },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Business tools for official numbers: ad leads, WhatsApp calling, invoices (and where quality alerts go). */
export function WaTools() {
  const [tab, setTab] = useState<TabId>('ads');
  const [sessionId, setSessionId] = useState('');
  const sessions = useQuery({ queryKey: ['sessions', 'list'], queryFn: () => sessionApi.list() });
  const cloud = (sessions.data ?? []).filter(s => s.engineType === 'cloud-api');
  const activeId = sessionId || cloud[0]?.id || '';

  return (
    <div className="wa-tools-page">
      <PageHeader
        title="WhatsApp Tools"
        subtitle="Leads from your Click-to-WhatsApp ads, WhatsApp calls and GST invoices — for your official numbers."
        icon={<Wrench size={24} />}
      />

      <p className="wt-note">
        <BellRing size={15} aria-hidden="true" /> Quality alerts (template paused, quality dropped, number limit
        lowered) arrive automatically in <Link to="/notifications">Notifications</Link>. In Meta → App → WhatsApp →
        Configuration, subscribe the webhook fields <code>messages</code>, <code>calls</code>,{' '}
        <code>message_template_status_update</code>, <code>message_template_quality_update</code>,{' '}
        <code>phone_number_quality_update</code> and <code>account_update</code>.
      </p>

      {sessions.isLoading ? (
        <p className="wt-muted">Loading numbers…</p>
      ) : !cloud.length ? (
        <p className="wt-card">
          These tools need an official (Cloud API) number. <Link to="/sessions">Connect one in Sessions</Link>.
        </p>
      ) : (
        <>
          <div className="wt-toolbar">
            <div className="wt-tabs" role="tablist" aria-label="WhatsApp tools">
              {TABS.map(t => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'is-active' : ''}
                  onClick={() => setTab(t.id)}
                >
                  <t.icon size={15} aria-hidden="true" /> {t.label}
                </button>
              ))}
            </div>
            {cloud.length > 1 && (
              <select
                className="wt-input"
                value={activeId}
                onChange={e => setSessionId(e.target.value)}
                aria-label="WhatsApp number"
              >
                {cloud.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {tab === 'ads' && <AdsTab sessionId={activeId} />}
          {tab === 'calls' && <CallsTab sessionId={activeId} />}
          {tab === 'invoices' && <InvoicesTab sessionId={activeId} />}
        </>
      )}
    </div>
  );
}
