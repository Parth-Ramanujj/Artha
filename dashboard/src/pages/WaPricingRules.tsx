import { IndianRupee } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

// Static reference of Meta's per-message pricing model (as changed on 1 October 2026). Rates change often,
// so this lists the rules only — the official rate card is linked for actual numbers.
const RATE_CARD_URL = 'https://developers.facebook.com/docs/whatsapp/pricing';

const CATEGORIES = [
  { name: 'Marketing', use: 'Offers, promotions, re-engagement', cost: 'Highest rate — always charged, even inside the 24h window' },
  { name: 'Utility', use: 'Order updates, invoices, booking confirmations', cost: 'Lower rate — charged even inside the 24h window (since 1 Oct 2026)' },
  { name: 'Authentication', use: 'OTP, login codes', cost: 'Lower rate — always charged' },
  { name: 'Service', use: 'Free-form replies inside the 24h window (incl. AI chatbot replies)', cost: 'First 1,000 a month per number free, then charged' },
];

const RULE_GROUPS: { title: string; rules: string[] }[] = [
  {
    title: 'What changed on 1 October 2026',
    rules: [
      'Utility templates are charged even inside the 24-hour window (they were free from July 2025).',
      'Free-form replies (Service) are free only for the first 1,000 delivered per phone number per month; from the 1,001st they are charged. This includes AI chatbot and agent replies.',
      'The 1,000 free Service messages reset every month and do not roll over.',
      'Without a payment method, Service messages stop after the free 1,000.',
      'India: the WhatsApp account must be billed in INR by 31 December 2026 — from 1 January 2027 Meta stops delivering for non-INR accounts.',
    ],
  },
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
      'Inside the window: free-form messages are Service messages — 1,000 free a month per number, then charged.',
      'Inside the window: Marketing, Utility and Authentication templates are all charged.',
      'A call from the user (answered or not) also opens or refreshes the window.',
      'Outside the window: only approved templates can be sent, and each one is charged.',
    ],
  },
  {
    title: 'Free entry point (Click-to-WhatsApp ads)',
    rules: [
      'User messages you from a Click-to-WhatsApp ad on the Android or iOS app (not WhatsApp Web / desktop).',
      'If you reply inside the 24-hour window, the free window opens from your reply and can stay open up to 7 days.',
      'While it is open, Marketing, Utility, Authentication and Service messages are all free.',
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
      'Business-initiated calls are charged per minute by country, billed in 6-second pulses (a 56-second call = 10 pulses), with volume tiers.',
      'Call recording and transcription are free for now; Meta plans to price them later.',
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
              <tr key={c.name} style={{ borderTop: '1px solid var(--border)' }}>
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
