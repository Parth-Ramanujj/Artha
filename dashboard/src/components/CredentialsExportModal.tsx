import { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShieldAlert,
  Smartphone,
  PhoneCall,
  Share2,
  Plug,
  Key,
  Server,
  FileCode,
  Search,
} from 'lucide-react';
import { Modal } from './Modal';
import { copyToClipboard } from '../utils/clipboard';
import type { AllCredentialsExport } from '../services/api';
import './CredentialsExportModal.css';

interface CredentialsExportModalProps {
  open: boolean;
  onClose: () => void;
  data: AllCredentialsExport;
}

type TabKey = 'whatsapp' | 'ai' | 'integrations' | 'social' | 'system' | 'platform' | 'json';

export function CredentialsExportModal({ open, onClose, data }: CredentialsExportModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('whatsapp');
  const [maskSecrets, setMaskSecrets] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, keyName: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openwa-all-credentials-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSecret = (val: string | null | undefined): string => {
    if (!val) return '';
    if (maskSecrets) {
      if (val.length <= 8) return '••••••••';
      return `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
    }
    return val;
  };

  const renderField = (label: string, value: string | null | undefined, keyId: string) => {
    const displayVal = formatSecret(value);
    const isEmpty = !value;

    return (
      <div className="export-field-row" key={keyId}>
        <span className="export-field-label">{label}</span>
        <div className="export-field-val-box">
          <span className={`export-field-value ${isEmpty ? 'empty' : ''}`}>
            {isEmpty ? '(Not configured)' : displayVal}
          </span>
          {!isEmpty && (
            <button
              className={`export-copy-btn ${copiedKey === keyId ? 'copied' : ''}`}
              onClick={() => handleCopy(value, keyId)}
              title="Copy to clipboard"
            >
              {copiedKey === keyId ? <Check size={12} /> : <Copy size={12} />}
              {copiedKey === keyId ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const query = searchQuery.toLowerCase().trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="credentials-export-modal"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Key className="text-emerald-500" size={20} />
          <span>Extract All API Keys & Connected Accounts</span>
        </div>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Exported at: {new Date(data.exportedAt).toLocaleString()}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" onClick={handleDownloadJson}>
              <Download size={15} /> Download Full JSON
            </button>
            <button
              className="btn-primary"
              onClick={() => handleCopy(JSON.stringify(data, null, 2), 'all_json')}
            >
              {copiedKey === 'all_json' ? <Check size={15} /> : <Copy size={15} />}
              {copiedKey === 'all_json' ? 'Copied Entire Export' : 'Copy Full JSON'}
            </button>
          </div>
        </div>
      }
    >
      <div className="export-modal-body">
        {/* Warning Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            fontSize: '0.82rem',
            color: '#f59e0b',
          }}
        >
          <ShieldAlert size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>Administrator Confidential:</strong> This export extracts all active WhatsApp keys, AI calling
            tokens (Twilio, ElevenLabs, Sarvam, Groq), system API keys, and connected third-party accounts. Store
            securely and do not share publicly.
          </span>
        </div>

        {/* Top Summary Badges */}
        <div className="export-summary-grid">
          <div className="export-summary-card">
            <span className="export-summary-label">WhatsApp Accounts</span>
            <span className="export-summary-value">{data.summary.totalSessions}</span>
          </div>
          <div className="export-summary-card">
            <span className="export-summary-label">Cloud API</span>
            <span className="export-summary-value" style={{ color: data.summary.hasCloudApi ? '#25d366' : '#ef4444' }}>
              {data.summary.hasCloudApi ? 'Active' : 'Not set'}
            </span>
          </div>
          <div className="export-summary-card">
            <span className="export-summary-label">AI Providers</span>
            <span className="export-summary-value">{data.summary.activeAiProviders.length} Active</span>
          </div>
          <div className="export-summary-card">
            <span className="export-summary-label">Integrations</span>
            <span className="export-summary-value">{data.summary.totalIntegrations}</span>
          </div>
          <div className="export-summary-card">
            <span className="export-summary-label">Social Accounts</span>
            <span className="export-summary-value">{data.summary.totalSocialAccounts}</span>
          </div>
          <div className="export-summary-card">
            <span className="export-summary-label">System API Keys</span>
            <span className="export-summary-value">{data.summary.totalSystemApiKeys}</span>
          </div>
        </div>

        {/* Toolbar: Search + Mask/Unmask */}
        <div className="export-toolbar">
          <div className="export-toolbar-left" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search keys, accounts, or providers..."
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-white)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                }}
              />
            </div>
          </div>
          <div className="export-toolbar-right">
            <button
              className="btn-secondary"
              onClick={() => setMaskSecrets(!maskSecrets)}
              style={{ fontSize: '0.8rem', padding: '5px 10px' }}
            >
              {maskSecrets ? <Eye size={14} /> : <EyeOff size={14} />}
              {maskSecrets ? 'Reveal Plaintext' : 'Mask Secrets'}
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="export-tabs-bar">
          <button
            className={`export-tab-btn ${activeTab === 'whatsapp' ? 'active' : ''}`}
            onClick={() => setActiveTab('whatsapp')}
          >
            <Smartphone size={15} /> WhatsApp & Cloud API
          </button>
          <button
            className={`export-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <PhoneCall size={15} /> AI & Telephony
          </button>
          <button
            className={`export-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('integrations')}
          >
            <Plug size={15} /> Integrations ({data.integrations.length})
          </button>
          <button
            className={`export-tab-btn ${activeTab === 'social' ? 'active' : ''}`}
            onClick={() => setActiveTab('social')}
          >
            <Share2 size={15} /> Social ({data.socialAccounts.length})
          </button>
          <button
            className={`export-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            <Key size={15} /> System Keys ({data.systemApiKeys.keys.length})
          </button>
          <button
            className={`export-tab-btn ${activeTab === 'platform' ? 'active' : ''}`}
            onClick={() => setActiveTab('platform')}
          >
            <Server size={15} /> Platform & Storage
          </button>
          <button
            className={`export-tab-btn ${activeTab === 'json' ? 'active' : ''}`}
            onClick={() => setActiveTab('json')}
          >
            <FileCode size={15} /> Raw JSON
          </button>
        </div>

        {/* TAB: WhatsApp & Cloud API */}
        {activeTab === 'whatsapp' && (
          <div className="export-section-content">
            {/* Meta Cloud API Card */}
            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <Smartphone size={16} /> Meta Official WhatsApp Cloud API
                </span>
                <span className={`export-badge ${data.whatsapp.cloudApi.isConfigured ? 'configured' : 'missing'}`}>
                  {data.whatsapp.cloudApi.isConfigured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              <div className="export-fields-grid">
                {renderField('Access Token (Permanent / System User)', data.whatsapp.cloudApi.accessToken, 'cloud_token')}
                {renderField('Phone Number ID', data.whatsapp.cloudApi.phoneNumberId, 'cloud_phone_id')}
                {renderField('WhatsApp Business Account ID (WABA ID)', data.whatsapp.cloudApi.wabaId, 'cloud_waba')}
                {renderField('Webhook Verify Token', data.whatsapp.cloudApi.verifyToken, 'cloud_verify')}
                {renderField('Meta App Secret', data.whatsapp.cloudApi.appSecret, 'cloud_app_secret')}
                {renderField('Meta App ID', data.whatsapp.cloudApi.appId, 'cloud_app_id')}
                {renderField('Graph API Version', data.whatsapp.cloudApi.graphVersion, 'cloud_version')}
              </div>
            </div>

            {/* Connected WhatsApp Sessions */}
            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <Smartphone size={16} /> Connected WhatsApp Sessions ({data.whatsapp.sessions.length})
                </span>
              </div>
              {data.whatsapp.sessions.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No WhatsApp sessions created yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.whatsapp.sessions
                    .filter(
                      s =>
                        !query ||
                        s.name.toLowerCase().includes(query) ||
                        (s.phone && s.phone.includes(query)) ||
                        (s.pushName && s.pushName.toLowerCase().includes(query)),
                    )
                    .map(sess => (
                      <div
                        key={sess.id}
                        style={{
                          background: 'rgba(0,0,0,0.15)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          padding: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                            {sess.name} {sess.phone ? `(+${sess.phone})` : ''}
                          </span>
                          <span className={`export-badge ${sess.status === 'ready' ? 'configured' : 'env'}`}>
                            {sess.status} • {sess.engineType || 'whatsapp-web.js'}
                          </span>
                        </div>
                        {sess.cloudApiConfig && (
                          <div className="export-fields-grid" style={{ marginTop: 4 }}>
                            {renderField('Session Cloud API Token', sess.cloudApiConfig.accessToken, `sess_tok_${sess.id}`)}
                            {renderField('Phone Number ID', sess.cloudApiConfig.phoneNumberId, `sess_pid_${sess.id}`)}
                          </div>
                        )}
                        {sess.proxyUrl && renderField('Session Proxy URL', sess.proxyUrl, `sess_proxy_${sess.id}`)}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: AI Engines & Telephony */}
        {activeTab === 'ai' && (
          <div className="export-section-content">
            {/* Twilio */}
            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <PhoneCall size={16} /> Twilio Telephony (Voice Calls)
                </span>
                <span className={`export-badge ${data.aiAndCalling.twilio.isConfigured ? 'configured' : 'missing'}`}>
                  {data.aiAndCalling.twilio.isConfigured ? 'Configured' : 'Missing credentials'}
                </span>
              </div>
              <div className="export-fields-grid">
                {renderField('Account SID', data.aiAndCalling.twilio.accountSid, 'twilio_sid')}
                {renderField('Auth Token', data.aiAndCalling.twilio.authToken, 'twilio_auth')}
                {renderField('Phone Number (Caller ID)', data.aiAndCalling.twilio.phoneNumber, 'twilio_phone')}
                {renderField('Public Webhook URL', data.aiAndCalling.telephonyPublicUrl, 'telephony_public_url')}
              </div>
            </div>

            {/* Speech & Voice Engines */}
            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <PhoneCall size={16} /> ElevenLabs, Sarvam AI & Deepgram
                </span>
              </div>
              <div className="export-fields-grid">
                {renderField('ElevenLabs API Key', data.aiAndCalling.elevenLabs.apiKey, 'eleven_key')}
                {renderField('ElevenLabs Voice ID', data.aiAndCalling.elevenLabs.voiceId, 'eleven_voice_id')}
                {renderField('ElevenLabs Model', data.aiAndCalling.elevenLabs.model, 'eleven_model')}
                {renderField('ElevenLabs Output Format', data.aiAndCalling.elevenLabs.outputFormat, 'eleven_format')}
                {renderField('Sarvam AI API Key', data.aiAndCalling.sarvam.apiKey, 'sarvam_key')}
                {renderField('Sarvam Gujarati Voice', data.aiAndCalling.sarvam.defaultGujaratiVoice, 'sarvam_gu_voice')}
                {renderField('Sarvam Hindi Voice', data.aiAndCalling.sarvam.defaultHindiVoice, 'sarvam_hi_voice')}
                {renderField('Deepgram STT API Key', data.aiAndCalling.deepgram.apiKey, 'deepgram_key')}
              </div>
            </div>

            {/* LLM & AI Models */}
            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <PhoneCall size={16} /> Language Models (LLM) & API Key Pool
                </span>
                <span className="export-badge env">{data.aiAndCalling.llm.provider}</span>
              </div>
              <div className="export-fields-grid">
                {renderField('Primary Groq API Key', data.aiAndCalling.llm.primaryGroqKey, 'groq_primary')}
                {data.aiAndCalling.llm.groqKeyPool.map((k, idx) =>
                  renderField(`Groq Pool Key #${idx + 1}`, k, `groq_pool_${idx}`),
                )}
                {renderField('Google Gemini API Key', data.aiAndCalling.llm.geminiApiKey, 'gemini_key')}
                {renderField('OpenRouter API Key', data.aiAndCalling.llm.openRouterApiKey, 'openrouter_key')}
                {renderField('OpenAI API Key', data.aiAndCalling.llm.openAiApiKey, 'openai_key')}
                {renderField('Custom LLM API Key', data.aiAndCalling.llm.customApiKey, 'custom_llm_key')}
                {renderField('Custom LLM Base URL', data.aiAndCalling.llm.customBaseUrl, 'custom_llm_url')}
                {renderField('Custom LLM Model Name', data.aiAndCalling.llm.customModel, 'custom_llm_model')}
              </div>
            </div>
          </div>
        )}

        {/* TAB: Integrations */}
        {activeTab === 'integrations' && (
          <div className="export-section-content">
            {data.integrations.length === 0 ? (
              <div className="export-card">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No third-party integrations connected.</p>
              </div>
            ) : (
              data.integrations
                .filter(i => !query || i.name.toLowerCase().includes(query) || i.type.toLowerCase().includes(query))
                .map(intg => (
                  <div className="export-card" key={intg.id}>
                    <div className="export-card-header">
                      <span className="export-card-title">
                        <Plug size={16} /> {intg.name}
                      </span>
                      <span className={`export-badge ${intg.status === 'connected' ? 'configured' : 'env'}`}>
                        {intg.type} • {intg.status}
                      </span>
                    </div>
                    {intg.config && (
                      <div className="export-fields-grid">
                        {Object.entries(intg.config).map(([cfgKey, cfgVal]) => {
                          if (typeof cfgVal === 'object') {
                            return renderField(cfgKey, JSON.stringify(cfgVal), `intg_${intg.id}_${cfgKey}`);
                          }
                          return renderField(cfgKey, String(cfgVal ?? ''), `intg_${intg.id}_${cfgKey}`);
                        })}
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        )}

        {/* TAB: Social Accounts */}
        {activeTab === 'social' && (
          <div className="export-section-content">
            {data.socialAccounts.length === 0 ? (
              <div className="export-card">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No social media accounts connected.</p>
              </div>
            ) : (
              data.socialAccounts
                .filter(s => !query || s.accountName.toLowerCase().includes(query) || s.platform.includes(query))
                .map(acc => (
                  <div className="export-card" key={acc.id}>
                    <div className="export-card-header">
                      <span className="export-card-title">
                        <Share2 size={16} /> {acc.accountName} ({acc.platform})
                      </span>
                      <span className={`export-badge ${acc.status === 'connected' ? 'configured' : 'env'}`}>
                        {acc.status}
                      </span>
                    </div>
                    <div className="export-fields-grid">
                      {renderField('Account ID / Page ID', acc.accountId, `soc_id_${acc.id}`)}
                      {renderField('Webhook Verify Token', acc.webhookVerifyToken, `soc_ver_${acc.id}`)}
                      {acc.xCredentials ? (
                        <>
                          {renderField('X API Key', acc.xCredentials.apiKey, `x_key_${acc.id}`)}
                          {renderField('X API Secret', acc.xCredentials.apiSecret, `x_sec_${acc.id}`)}
                          {renderField('X Access Token', acc.xCredentials.accessToken, `x_tok_${acc.id}`)}
                          {renderField('X Access Token Secret', acc.xCredentials.accessTokenSecret, `x_toksec_${acc.id}`)}
                        </>
                      ) : (
                        renderField('Access Token / Bot Token', acc.accessToken, `soc_tok_${acc.id}`)
                      )}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* TAB: System API Keys */}
        {activeTab === 'system' && (
          <div className="export-section-content">
            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <Key size={16} /> System Master & Bootstrap Keys
                </span>
              </div>
              <div className="export-fields-grid">
                {renderField('Active Bootstrap Admin Key (from data/.api-key)', data.systemApiKeys.bootstrapAdminKey, 'boot_key')}
                {renderField('API Master Key (from API_MASTER_KEY)', data.systemApiKeys.masterKeyFromEnv, 'master_env')}
              </div>
            </div>

            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <Key size={16} /> Generated API Keys ({data.systemApiKeys.keys.length})
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.systemApiKeys.keys
                  .filter(k => !query || k.name.toLowerCase().includes(query) || k.keyPrefix.includes(query))
                  .map(k => (
                    <div
                      key={k.id}
                      style={{
                        background: 'rgba(0,0,0,0.15)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{k.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Prefix: <code>{k.keyPrefix}...</code> • Role: <strong>{k.role}</strong> • Created:{' '}
                          {new Date(k.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span className={`export-badge ${k.isActive ? 'configured' : 'missing'}`}>
                        {k.isActive ? 'Active' : 'Revoked'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: Platform & Storage */}
        {activeTab === 'platform' && (
          <div className="export-section-content">
            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <Server size={16} /> Razorpay Payment Gateway
                </span>
                <span className={`export-badge ${data.platformSecrets.razorpay.isConfigured ? 'configured' : 'missing'}`}>
                  {data.platformSecrets.razorpay.isConfigured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              <div className="export-fields-grid">
                {renderField('Razorpay Key ID', data.platformSecrets.razorpay.keyId, 'rzp_id')}
                {renderField('Razorpay Key Secret', data.platformSecrets.razorpay.keySecret, 'rzp_sec')}
              </div>
            </div>

            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <Server size={16} /> S3 Storage & Object Store
                </span>
                <span className={`export-badge ${data.platformSecrets.storageS3.isConfigured ? 'configured' : 'missing'}`}>
                  {data.platformSecrets.storageS3.isConfigured ? 'Configured' : 'Local disk'}
                </span>
              </div>
              <div className="export-fields-grid">
                {renderField('S3 Access Key ID', data.platformSecrets.storageS3.accessKeyId, 's3_access')}
                {renderField('S3 Secret Access Key', data.platformSecrets.storageS3.secretAccessKey, 's3_secret')}
                {renderField('S3 Bucket Name', data.platformSecrets.storageS3.bucket, 's3_bucket')}
                {renderField('S3 Region', data.platformSecrets.storageS3.region, 's3_region')}
                {renderField('S3 Endpoint URL', data.platformSecrets.storageS3.endpoint, 's3_endpoint')}
              </div>
            </div>

            <div className="export-card">
              <div className="export-card-header">
                <span className="export-card-title">
                  <Server size={16} /> Webhook & System Tokens
                </span>
              </div>
              <div className="export-fields-grid">
                {renderField('Metrics Scraper Token', data.platformSecrets.metricsToken, 'metric_tok')}
                {renderField('Meta App Secret', data.platformSecrets.metaAppSecret, 'meta_secret')}
                {renderField(
                  'Google Token Encryption Key Configured',
                  data.platformSecrets.encryptionConfigured ? 'Yes (AES-256-GCM active)' : 'No',
                  'enc_status',
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: Raw JSON */}
        {activeTab === 'json' && (
          <div className="export-section-content">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                className="export-copy-btn"
                onClick={() => handleCopy(JSON.stringify(data, null, 2), 'raw_json_btn')}
              >
                {copiedKey === 'raw_json_btn' ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey === 'raw_json_btn' ? 'Copied' : 'Copy Raw JSON'}
              </button>
            </div>
            <pre className="export-raw-json">{JSON.stringify(data, null, 2)}</pre>
          </div>
        )}
      </div>
    </Modal>
  );
}
