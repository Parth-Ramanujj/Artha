import { useCallback, useEffect, useState } from 'react';
import { libraryApi } from '../services/api';
import type { LibraryAutomation, LibraryItem, LibraryOverview, LibraryRun } from '../types/library';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import { PostsTab } from '../components/library/PostsTab';
import { AutomationsTab } from '../components/library/AutomationsTab';
import { HistoryTab } from '../components/library/HistoryTab';
import { PostEditorModal, type PostDraft } from '../components/library/PostEditorModal';
import { ReadyMadeTab } from '../components/library/ReadyMadeTab';
import { PostNowModal } from '../components/library/PostNowModal';
import { AutomationModal } from '../components/library/AutomationModal';
import './SalesAgent.css';
import './Library.css';

const TABS = [
  { id: 'posts', label: 'My posts' },
  { id: 'ready', label: 'Ready-made' },
  { id: 'automations', label: 'Automations' },
  { id: 'history', label: 'History' },
] as const;
type TabId = (typeof TABS)[number]['id'];

type Dialog =
  | { kind: 'post'; item: LibraryItem | null; draft?: PostDraft }
  | { kind: 'postNow'; item: LibraryItem }
  | { kind: 'automation'; automation: LibraryAutomation | null; itemIds?: string[] }
  | null;

export function Library() {
  useDocumentTitle('Library');
  const [tab, setTab] = useState<TabId>('posts');
  const [overview, setOverview] = useState<LibraryOverview | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [automations, setAutomations] = useState<LibraryAutomation[]>([]);
  const [runs, setRuns] = useState<LibraryRun[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([libraryApi.overview(), libraryApi.items(), libraryApi.automations(), libraryApi.runs()])
      .then(([o, i, a, r]) => {
        setOverview(o);
        setItems(i);
        setAutomations(a);
        setRuns(r);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(refresh, [refresh]);

  const saved = () => {
    setDialog(null);
    refresh();
  };

  const o = overview;
  return (
    <div className="sa-page">
      <PageHeader
        title="Library"
        subtitle="Keep your posts in one place, post them to WhatsApp Status or chats, and schedule them to go out automatically"
      />
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}

      {o && (
        <section className="sa-stats" aria-label="Library stats">
          <Stat label="Posts" value={o.items} />
          <Stat label="Photos / videos" value={`${o.byType.image} / ${o.byType.video}`} />
          <Stat label="Active automations" value={o.activeAutomations} tone={o.activeAutomations ? 'ok' : 'muted'} />
          <Stat label="Next post" value={o.nextRunAt ? new Date(o.nextRunAt).toLocaleString() : '–'} />
          <Stat label="Messages sent (7 days)" value={o.sentThisWeek} />
          <Stat label="Status posts (7 days)" value={o.statusPostsThisWeek} />
        </section>
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
        {tab === 'posts' && (
          <PostsTab
            items={items}
            onNew={() => setDialog({ kind: 'post', item: null })}
            onEdit={item => setDialog({ kind: 'post', item })}
            onPostNow={item => setDialog({ kind: 'postNow', item })}
            onSchedule={item => setDialog({ kind: 'automation', automation: null, itemIds: [item.id] })}
            onChange={refresh}
          />
        )}
        {tab === 'automations' && (
          <AutomationsTab
            automations={automations}
            items={items}
            onNew={() => setDialog({ kind: 'automation', automation: null })}
            onEdit={automation => setDialog({ kind: 'automation', automation })}
            onChange={refresh}
          />
        )}
        {tab === 'ready' && <ReadyMadeTab onUse={draft => setDialog({ kind: 'post', item: null, draft })} />}
        {tab === 'history' && <HistoryTab runs={runs} automations={automations} />}
      </div>

      {dialog?.kind === 'post' && (
        <PostEditorModal
          item={dialog.item}
          draft={dialog.draft}
          categories={o?.categories ?? []}
          onClose={() => setDialog(null)}
          onSaved={() => {
            saved();
            setTab('posts');
          }}
        />
      )}
      {dialog?.kind === 'postNow' && (
        <PostNowModal item={dialog.item} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'automation' && (
        <AutomationModal
          automation={dialog.automation}
          items={items}
          initialItemIds={dialog.itemIds}
          onClose={() => setDialog(null)}
          onSaved={() => {
            saved();
            setTab('automations');
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'muted' }) {
  return (
    <div className={`sa-stat ${tone ?? ''}`}>
      <span className="sa-stat-value">{value}</span>
      <span className="sa-stat-label">{label}</span>
    </div>
  );
}
