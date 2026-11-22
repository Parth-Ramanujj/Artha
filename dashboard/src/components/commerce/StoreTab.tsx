import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, ShoppingBag, Unplug } from 'lucide-react';
import type { ShopifyOverview } from '../../services/api';
import { field, fmtMoney, label } from '../../utils/commerceFormat';

const TOPIC_LABEL: Record<string, string> = {
  CHECKOUTS_CREATE: 'checkouts/create',
  CHECKOUTS_UPDATE: 'checkouts/update',
  ORDERS_CREATE: 'orders/create',
};

export function StoreTab({
  overview,
  busy,
  onConnect,
  onSync,
  onDisconnect,
}: {
  overview: ShopifyOverview;
  busy: string | null;
  onConnect: (input: {
    shopDomain: string;
    clientId: string;
    clientSecret?: string;
    accessToken?: string;
  }) => Promise<void>;
  onSync: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const store = overview.connected ? overview.store : null;
  const [editing, setEditing] = useState(!store);
  const [shopDomain, setShopDomain] = useState(store?.shopDomain ?? '');
  const [clientId, setClientId] = useState(store?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => setEditing(!store), [store]);

  return (
    <>
      {store && (
        <div className="store-status-card">
          <div className="store-info-left">
            <div className="shopify-bag-icon">
              <ShoppingBag size={28} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                  {store.shopName || store.shopDomain}
                </h3>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: store.status === 'connected' ? '#10b981' : '#ef4444',
                    background: store.status === 'connected' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}
                >
                  {store.status === 'connected' ? '✓ Connected' : '⚠ Problem'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                {store.shopDomain} · {store.currency}
                {store.lastSyncAt ? ` · Last catalog sync ${new Date(store.lastSyncAt).toLocaleString()}` : ''}
              </p>
              {store.lastError && (
                <p className="sa-error" style={{ margin: '4px 0 0' }}>
                  {store.lastError}
                </p>
              )}
            </div>
          </div>
          <div className="store-metrics-row">
            <div className="metric-pill">
              <span className="metric-pill-label">Products in catalog</span>
              <span className="metric-pill-value">{store.productsSynced}</span>
            </div>
            {overview.connected && (
              <div className="metric-pill">
                <span className="metric-pill-label">Recovered revenue</span>
                <span className="metric-pill-value" style={{ color: '#10b981' }}>
                  {fmtMoney(overview.stats.recoveredRevenue, store.currency)}
                </span>
              </div>
            )}
            <button className="btn btn-primary" onClick={() => void onSync()} disabled={busy === 'sync'}>
              <RefreshCw size={15} className={busy === 'sync' ? 'spin' : ''} />
              {busy === 'sync' ? 'Syncing…' : 'Sync catalog now'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="recovery-config-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {store ? 'Store connection' : 'Connect your Shopify store'}
            </h4>
            {store && !editing && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  Change keys
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void onDisconnect()}
                  disabled={busy === 'disconnect'}
                >
                  <Unplug size={14} /> Disconnect
                </button>
              </div>
            )}
          </div>

          {editing ? (
            <form
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              onSubmit={e => {
                e.preventDefault();
                void onConnect({
                  shopDomain,
                  clientId,
                  clientSecret: clientSecret || undefined,
                  accessToken: accessToken || undefined,
                }).then(() => {
                  setClientSecret('');
                  setAccessToken('');
                });
              }}
            >
              <div>
                <label style={label} htmlFor="shop-domain">
                  Store address
                </label>
                <input
                  id="shop-domain"
                  className="input"
                  style={field}
                  required
                  placeholder="my-shop.myshopify.com"
                  value={shopDomain}
                  onChange={e => setShopDomain(e.target.value)}
                />
              </div>
              <div>
                <label style={label} htmlFor="shop-client-id">
                  App Client ID
                </label>
                <input
                  id="shop-client-id"
                  className="input"
                  style={field}
                  required
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                />
              </div>
              <div>
                <label style={label} htmlFor="shop-client-secret">
                  App Client secret
                </label>
                <input
                  id="shop-client-secret"
                  className="input"
                  style={field}
                  type="password"
                  autoComplete="off"
                  required={!store}
                  placeholder={store ? 'Leave empty to keep the saved secret' : ''}
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                />
              </div>
              <details>
                <summary className="sa-help" style={{ cursor: 'pointer' }}>
                  Have an older custom app made in the Shopify admin?
                </summary>
                <div style={{ marginTop: 8 }}>
                  <label style={label} htmlFor="shop-legacy-token">
                    Admin API access token (optional)
                  </label>
                  <input
                    id="shop-legacy-token"
                    className="input"
                    style={field}
                    type="password"
                    autoComplete="off"
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                  />
                  <p className="sa-help">
                    Put that app&apos;s API key in Client ID and its API secret key in Client secret (it signs
                    webhooks).
                  </p>
                </div>
              </details>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={busy === 'connect'}>
                  {busy === 'connect' ? 'Checking with Shopify…' : store ? 'Save and reconnect' : 'Connect store'}
                </button>
                {store && (
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            store && (
              <p className="sa-help" style={{ margin: 0 }}>
                Connected with app <code>{store.clientId}</code>. Keys are stored on the server and never shown again.
              </p>
            )
          )}
        </div>

        <div className="recovery-config-card">
          {store ? (
            <>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Shopify webhooks</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.875rem' }}>
                {Object.entries(TOPIC_LABEL).map(([topic, name]) => {
                  const state = store.webhooks?.[topic];
                  const ok = state === 'ok';
                  return (
                    <div
                      key={topic}
                      style={{ padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, display: 'grid', gap: 2 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{name}</span>
                        <span style={{ color: ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          {ok ? 'Subscribed' : 'Not subscribed'}
                        </span>
                      </div>
                      {!ok && state && <span className="sa-help">{state}</span>}
                    </div>
                  );
                })}
              </div>
              <p className="sa-help" style={{ margin: 0 }}>
                Deliveries go to <code>{overview.webhookUrl ?? 'a public https address (set BASE_URL)'}</code>. If one
                is not subscribed, fix the cause and press Change keys → Save and reconnect.
              </p>
            </>
          ) : (
            <SetupSteps webhookUrl={overview.webhookUrl} />
          )}
        </div>
      </div>
      {store && <SetupSteps webhookUrl={overview.webhookUrl} collapsed />}
    </>
  );
}

function SetupSteps({ webhookUrl, collapsed }: { webhookUrl: string | null; collapsed?: boolean }) {
  const body = (
    <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: 6, fontSize: '0.875rem' }}>
      <li>
        Open the{' '}
        <a href="https://dev.shopify.com/dashboard" target="_blank" rel="noreferrer">
          Shopify Dev Dashboard <ExternalLink size={12} />
        </a>{' '}
        with the same Shopify account that owns the store, and create an app (Shopify no longer allows new custom apps
        inside the store admin since 1 January 2026).
      </li>
      <li>
        In the app&apos;s version, give it the access scopes <code>read_products</code> and <code>read_orders</code>.
      </li>
      <li>
        Under protected customer data, select <b>name, email, phone and address</b>. Shopify only sends the checkout
        link to apps with all four (from 1 January 2027 for custom apps).
      </li>
      <li>Release the version, then install the app on your store from the app&apos;s Installs card.</li>
      <li>
        Copy the app&apos;s <b>Client ID</b> and <b>Client secret</b> into the form and press Connect store. We get a
        fresh access token from Shopify every day and subscribe the webhooks for you.
      </li>
      <li>
        This server must be reachable over https for webhooks:{' '}
        <code>{webhookUrl ?? 'set BASE_URL to your public https address'}</code>
      </li>
    </ol>
  );
  return (
    <div className="recovery-config-card">
      {collapsed ? (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>How the Shopify app is set up</summary>
          <div style={{ marginTop: 10 }}>{body}</div>
        </details>
      ) : (
        <>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>How to get the keys (about 5 minutes)</h4>
          {body}
        </>
      )}
    </div>
  );
}
