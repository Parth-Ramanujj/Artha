import { useState } from 'react';
import {
  ShoppingBag,
  ShoppingCart,
  Percent,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import './ShopifyCommerce.css';

export function ShopifyCommerce() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'store' | 'recovery' | 'discounts'>('store');

  // Store Config State
  const [storeDomain, setStoreDomain] = useState('fabrics-india.myshopify.com');
  const [accessToken, setAccessToken] = useState('shpat_982348239482347293847');
  const [isSyncing, setIsSyncing] = useState(false);

  // Abandoned Cart Recovery State
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [recoveryDelay, setRecoveryDelay] = useState('30');
  const [discountCode, setDiscountCode] = useState('COMEBACK10');
  const [cartMessageTemplate, setCartMessageTemplate] = useState(
    'Hey {{first_name}}! We noticed you left some amazing items in your cart. Complete your purchase now and get an extra 10% off using coupon {{discount_code}}: {{checkout_url}}'
  );

  // Volume Calculator State
  const [calcVolume, setCalcVolume] = useState(25000);

  // Sync Store Catalog
  const handleSyncCatalog = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      toast.addToast({
        type: 'success',
        title: 'Shopify Catalog Synced: 148 products & 12 collections updated',
      });
    }, 1200);
  };

  // Calculate Volume Pricing
  const getRateForVolume = (volume: number) => {
    if (volume <= 10000) return 0.72;
    if (volume <= 50000) return 0.58;
    if (volume <= 200000) return 0.46;
    return 0.35;
  };

  const currentRate = getRateForVolume(calcVolume);
  const baseCost = calcVolume * 0.72;
  const discountedCost = Math.round(calcVolume * currentRate);
  const savings = baseCost - discountedCost;
  const savingsPercent = Math.round((savings / baseCost) * 100);

  return (
    <div className="commerce-page" data-testid="shopify-commerce-page">
      <PageHeader
        title="Shopify Commerce & Volume Discounts"
        subtitle="Deep Shopify store integration, automated abandoned cart recovery, and tiered broadcast pricing"
      />

      {/* Tabs */}
      <div className="commerce-tabs">
        <button
          className={`commerce-tab-btn ${activeTab === 'store' ? 'active' : ''}`}
          onClick={() => setActiveTab('store')}
        >
          <ShoppingBag size={16} />
          Shopify Store Sync
        </button>
        <button
          className={`commerce-tab-btn ${activeTab === 'recovery' ? 'active' : ''}`}
          onClick={() => setActiveTab('recovery')}
        >
          <ShoppingCart size={16} />
          Abandoned Cart Recovery
        </button>
        <button
          className={`commerce-tab-btn ${activeTab === 'discounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('discounts')}
        >
          <Percent size={16} />
          Volume Discounts & Billing
        </button>
      </div>

      {/* Tab 1: Store Sync */}
      {activeTab === 'store' && (
        <>
          <div className="store-status-card">
            <div className="store-info-left">
              <div className="shopify-bag-icon">
                <ShoppingBag size={28} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{storeDomain}</h3>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '2px 8px',
                      borderRadius: 12,
                    }}
                  >
                    ✓ Live Sync Active
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Shopify Admin API v2024-04 • Webhooks: orders/create, checkouts/update
                </p>
              </div>
            </div>

            <div className="store-metrics-row">
              <div className="metric-pill">
                <span className="metric-pill-label">Synced Products</span>
                <span className="metric-pill-value">148</span>
              </div>
              <div className="metric-pill">
                <span className="metric-pill-label">Active Orders</span>
                <span className="metric-pill-value">892</span>
              </div>
              <div className="metric-pill">
                <span className="metric-pill-label">Recovered Revenue</span>
                <span className="metric-pill-value" style={{ color: '#10b981' }}>
                  ₹2,48,500
                </span>
              </div>
              <button
                className="btn-primary"
                onClick={handleSyncCatalog}
                disabled={isSyncing}
              >
                <RefreshCw size={15} className={isSyncing ? 'spin' : ''} />
                {isSyncing ? 'Syncing...' : 'Sync Catalog Now'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="recovery-config-card">
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Store Credentials</h4>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Shopify Store Domain
                </label>
                <input
                  type="text"
                  value={storeDomain}
                  onChange={e => setStoreDomain(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Admin API Access Token
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
              </div>

              <button
                className="btn-primary"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => toast.addToast({ type: 'success', title: 'Store credentials updated' })}
              >
                Save Connection
              </button>
            </div>

            <div className="recovery-config-card">
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Commerce Webhooks Health</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                  <span>checkouts/create</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Active (200 OK)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                  <span>orders/fulfilled</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Active (200 OK)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                  <span>inventory_levels/update</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Active (200 OK)</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tab 2: Abandoned Cart Recovery */}
      {activeTab === 'recovery' && (
        <div className="recovery-grid">
          <div className="recovery-config-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Automated Cart Recovery Workflow
              </h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={recoveryEnabled}
                  onChange={e => setRecoveryEnabled(e.target.checked)}
                />
                Enabled
              </label>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Trigger Delay After Cart Abandonment
              </label>
              <select
                className="pipeline-select"
                style={{ width: '100%' }}
                value={recoveryDelay}
                onChange={e => setRecoveryDelay(e.target.value)}
              >
                <option value="15">15 Minutes (High Urgency)</option>
                <option value="30">30 Minutes (Recommended)</option>
                <option value="60">1 Hour (Standard)</option>
                <option value="120">2 Hours</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Dynamic Discount Promo Code
              </label>
              <input
                type="text"
                value={discountCode}
                onChange={e => setDiscountCode(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                WhatsApp Message Template
              </label>
              <textarea
                rows={4}
                value={cartMessageTemplate}
                onChange={e => setCartMessageTemplate(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', resize: 'vertical' }}
              />
            </div>

            <button
              className="btn-primary"
              onClick={() => toast.addToast({ type: 'success', title: 'Cart recovery workflow saved' })}
            >
              Save Workflow Settings
            </button>
          </div>

          <div className="recovery-config-card">
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Recovery Performance Analytics</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Abandoned Carts</span>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>142</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>WhatsApp Sent</span>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#3b82f6' }}>118</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Carts Recovered</span>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#10b981' }}>52 (44%)</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Recovered Revenue</span>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#10b981' }}>₹2,48,500</div>
              </div>
            </div>

            <div style={{ padding: 12, border: '1px dashed var(--border-color)', borderRadius: 8, fontSize: 12 }}>
              <strong>ROI Insight:</strong> For every ₹1 spent on WhatsApp recovery messages, your Shopify store has generated <strong>₹18.40</strong> in recovered GMV!
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Volume Discounts & Billing */}
      {activeTab === 'discounts' && (
        <>
          <div className="pricing-tiers-grid">
            <div className="tier-card">
              <h4 className="tier-name">Starter Tier</h4>
              <div className="tier-rate">
                ₹0.72 <span>/ message</span>
              </div>
              <div className="tier-volume">1 - 10,000 Messages / month</div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Standard pay-as-you-go rate for small businesses and test broadcasts.
              </p>
            </div>

            <div className="tier-card featured">
              <div className="featured-ribbon">20% Savings</div>
              <h4 className="tier-name">Growth Tier</h4>
              <div className="tier-rate">
                ₹0.58 <span>/ message</span>
              </div>
              <div className="tier-volume">10,001 - 50,000 Messages / month</div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Best for growing e-commerce stores running weekly campaigns.
              </p>
            </div>

            <div className="tier-card">
              <div className="featured-ribbon" style={{ background: '#10b981' }}>36% Savings</div>
              <h4 className="tier-name">Scale Tier</h4>
              <div className="tier-rate">
                ₹0.46 <span>/ message</span>
              </div>
              <div className="tier-volume">50,001 - 200,000 Messages / month</div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                High-volume enterprises, festival campaigns, and automated notifications.
              </p>
            </div>

            <div className="tier-card">
              <div className="featured-ribbon" style={{ background: '#f59e0b' }}>51% Off</div>
              <h4 className="tier-name">Enterprise VIP</h4>
              <div className="tier-rate">
                ₹0.35 <span>/ message</span>
              </div>
              <div className="tier-volume">200,000+ Messages / month</div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Includes Dedicated Customer Success Manager (CSM) and Priority 24/7 SLA.
              </p>
            </div>
          </div>

          {/* Interactive Calculator */}
          <div className="recovery-config-card" style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
              Interactive Volume Discount Calculator
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Monthly Broadcast Volume:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#6366f1' }}>
                  {calcVolume.toLocaleString()} messages
                </span>
              </div>
              <input
                type="range"
                min={1000}
                max={300000}
                step={5000}
                value={calcVolume}
                onChange={e => setCalcVolume(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 8 }}>
                <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Applicable Rate</span>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>₹{currentRate} / msg</div>
                </div>

                <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total Cost</span>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>₹{discountedCost.toLocaleString('en-IN')}</div>
                </div>

                <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Volume Discount Savings</span>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>
                    ₹{savings.toLocaleString('en-IN')} ({savingsPercent}%)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export default ShopifyCommerce;
