import { useCallback, useEffect, useState } from 'react';
import { Percent, ShoppingBag, ShoppingCart } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { DiscountsTab } from '../components/commerce/DiscountsTab';
import { RecoveryTab } from '../components/commerce/RecoveryTab';
import { errText } from '../utils/commerceFormat';
import { StoreTab } from '../components/commerce/StoreTab';
import { sessionApi, shopifyApi, walletApi, type Session, type ShopifyOverview, type WalletOverview } from '../services/api';
import './ShopifyCommerce.css';

type Tab = 'store' | 'recovery' | 'discounts';

export function ShopifyCommerce() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('store');
  const [overview, setOverview] = useState<ShopifyOverview | null>(null);
  const [wallet, setWallet] = useState<WalletOverview | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, w, s] = await Promise.all([
        shopifyApi.overview(),
        walletApi.overview().catch(() => null),
        sessionApi.list().catch(() => []),
      ]);
      setOverview(o);
      setWallet(w);
      setSessions(s);
      setLoadError(null);
    } catch (err) {
      setLoadError(errText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async <T,>(key: string, fn: () => Promise<T>, success?: (r: T) => string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (success) toast.addToast({ type: 'success', title: success(r) });
      return r;
    } catch (err) {
      toast.addToast({ type: 'error', title: errText(err) });
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const connected = overview?.connected ? overview : null;

  return (
    <div className="commerce-page" data-testid="shopify-commerce-page">
      <PageHeader
        title="Shopify Commerce & Volume Discounts"
        subtitle="Connect your Shopify store, bring its products into WhatsApp, win back abandoned carts, and see your message volume pricing"
      />

      <div className="commerce-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'store'}
          className={`commerce-tab-btn ${tab === 'store' ? 'active' : ''}`}
          onClick={() => setTab('store')}
        >
          <ShoppingBag size={16} /> Shopify Store
        </button>
        <button
          role="tab"
          aria-selected={tab === 'recovery'}
          className={`commerce-tab-btn ${tab === 'recovery' ? 'active' : ''}`}
          onClick={() => setTab('recovery')}
        >
          <ShoppingCart size={16} /> Abandoned Cart Recovery
        </button>
        <button
          role="tab"
          aria-selected={tab === 'discounts'}
          className={`commerce-tab-btn ${tab === 'discounts' ? 'active' : ''}`}
          onClick={() => setTab('discounts')}
        >
          <Percent size={16} /> Volume Discounts & Billing
        </button>
      </div>

      {loadError && (
        <p className="sa-error" role="alert">
          {loadError}
        </p>
      )}
      {!overview && !loadError && <p className="sa-help">Loading…</p>}

      {overview && tab === 'store' && (
        <StoreTab
          overview={overview}
          busy={busy}
          onConnect={async input => {
            const o = await run(
              'connect',
              () => shopifyApi.connect(input),
              () => 'Shopify store connected',
            );
            if (o) setOverview(o);
          }}
          onSync={async () => {
            await run(
              'sync',
              () => shopifyApi.sync(),
              r =>
                `${r.synced} products synced into your catalog${r.archived ? `, ${r.archived} removed` : ''}${
                  r.complete ? '' : ' (first 2,000 only)'
                }`,
            );
            await load();
          }}
          onDisconnect={async () => {
            if (
              !window.confirm(
                'Disconnect this Shopify store? Cart reminders stop; synced products stay in your catalog.',
              )
            )
              return;
            await run(
              'disconnect',
              () => shopifyApi.disconnect(),
              () => 'Shopify store disconnected',
            );
            await load();
          }}
        />
      )}

      {overview &&
        tab === 'recovery' &&
        (connected ? (
          <RecoveryTab
            data={connected}
            sessions={sessions}
            busy={busy}
            onSave={async input => {
              const o = await run(
                'save',
                () => shopifyApi.saveRecovery(input),
                () => 'Cart recovery settings saved',
              );
              if (o) setOverview(o);
            }}
            onTest={phone =>
              run(
                'test',
                () => shopifyApi.sendTest(phone),
                () => 'Test reminder sent on WhatsApp',
              ).then(() => undefined)
            }
            onRefresh={load}
          />
        ) : (
          <div className="recovery-config-card">
            <p style={{ margin: 0 }}>Connect your Shopify store first (Shopify Store tab).</p>
          </div>
        ))}

      {tab === 'discounts' && (
        <DiscountsTab
          wallet={wallet}
          busy={busy}
          onSaveTiers={async tiers => {
            const saved = await run(
              'tiers',
              () => walletApi.adminSetVolumeTiers(tiers),
              () => 'Volume tiers saved',
            );
            if (saved) await load();
          }}
        />
      )}
    </div>
  );
}

export default ShopifyCommerce;
