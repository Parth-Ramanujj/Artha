import { IndianRupee } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

// Static reference of Meta's per-message pricing model (effective July 2025). Rates change often,
// so this lists the rules only — the official rate card is linked for actual numbers.
const RATE_CARD_URL = 'https://developers.facebook.com/docs/whatsapp/pricing';

const CATEGORIES = [
  { name: 'Marketing', use: 'Offers, promotions, re-engagement', cost: 'Highest rate — always charged, even inside the 24h window' },
  { name: 'Utility', use: 'Order updates, invoices, booking confirmations', cost: 'Lower rate — free inside an open 24h window' },
  { name: 'Authentication', use: 'OTP, login codes', cost: 'Lower rate — always charged' },
  { name: 'Service', use: 'Free-form replies inside the 24h window', cost: 'Free' },
];

const RULE_GROUPS: { title: string; rules: string[] }[] = [
  {
    title: 'Billing basics',
    rules: [
      'You pay per delivered template message, not per conversation.',
      'Failed / undelivered messages are not charged.',
      'Cloud API itself is free — no fee for hosting, API access or the phone number.',
    ],
  },
  {
    title: '24-hour customer service window',
    rules: [
      'Opens every time the user messages you and lasts 24 hours from their last message.',
      'Inside the window: free-form messages are free, and Utility templates are free.',
      'Inside the window: Marketing and Authentication templates are still charged.',
      'Outside the window: only approved templates can be sent, and each one is charged.',
    ],
  },
  {
    title: 'Free entry point (72 hours)',
    rules: [
      'User arrives via a Click-to-WhatsApp ad or a Facebook Page CTA button.',
      'If you reply within 24 hours, every message (templates included) is free for 72 hours.',
    ],
  },
  {
    title: 'Country-based rates',
    rules: [
      "Rate depends on the recipient's phone country code, not your business location.",
      'Authentication-International: higher OTP rate in some countries (e.g. India, Indonesia) when the business is registered outside that country.',
    ],
  },
  {
    title: 'Volume tiers',
    rules: [
      'Utility and Authentication get lower rates as monthly volume grows (per market, per business portfolio).',
      'Marketing has no volume discount.',
    ],
  },
  {
    title: 'Template category',
    rules: [
      'Meta can re-categorise a template — a Utility template with promotional content is billed as Marketing.',
      'Category is fixed at approval time; review it before submitting.',
    ],
  },
  {
    title: 'Marketing frequency cap',
    rules: ['Meta limits how many marketing messages one user receives; blocked messages are not delivered and not charged.'],
  },
  {
    title: 'Calling API',
    rules: [
      'User-initiated calls are free.',
      'Business-initiated calls are charged per minute by country, with volume tiers.',
      'You must get call permission from the user first; the permission request message can be charged.',
    ],
  },
  {
    title: 'Other',
    rules: [
      'In India billing is in INR, with 18% GST added on top.',
      'A BSP (Twilio, Gupshup, Interakt…) adds its own markup; direct Cloud API has none.',
      'A payment method must be added in Meta Business Manager, otherwise templates cannot be sent.',
    ],
  },
];

const SAVING_TIPS = [
  'Reply inside the 24h window whenever possible.',
  'Send Utility messages while the window is open — they are free.',
  'Use Click-to-WhatsApp ads for leads to get 72 free hours.',
];

export function WaPricingRules() {
  return (
    <div className="page">
      <PageHeader
        title="WhatsApp Pricing Rules"
        subtitle="How WhatsApp Cloud API charges you (per-message model, effective July 2025)"
        icon={<IndianRupee size={22} />}
      />

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem', overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Message categories</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Category</th>
              <th style={{ padding: '0.5rem' }}>Used for</th>
              <th style={{ padding: '0.5rem' }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map(c => (
              <tr key={c.name} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <td style={{ padding: '0.5rem', fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: '0.5rem' }}>{c.use}</td>
                <td style={{ padding: '0.5rem' }}>{c.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {RULE_GROUPS.map(g => (
          <div key={g.title} className="card" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>{g.title}</h3>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
              {g.rules.map(r => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Ways to save cost</h3>
        <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
          {SAVING_TIPS.map(tip => (
            <li key={tip}>{tip}</li>
          ))}
        </ol>
        <p style={{ marginBottom: 0, opacity: 0.75 }}>
          Exact rates change often — check Meta's{' '}
          <a href={RATE_CARD_URL} target="_blank" rel="noopener noreferrer">
            official pricing page
          </a>
          .
        </p>
      </div>
    </div>
  );
}
