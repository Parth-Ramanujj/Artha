import type { CapturedWebhookRequest } from './webhook-test.controller';

/**
 * Renders a standalone, high-performance, developer-grade Webhook Inspector & Echo UI
 */
export function renderWebhookInspectorHtml(
  currentUrl: string,
  selectedRequest?: CapturedWebhookRequest,
  history: CapturedWebhookRequest[] = [],
  nonce: string = '',
): string {
  const safeHistory = JSON.stringify(history).replace(/</g, '\\u003c');
  const safeSelected = JSON.stringify(
    selectedRequest || (history.length > 0 ? history[history.length - 1] : null),
  ).replace(/</g, '\\u003c');
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';

  const sampleNames = [
    'Rahul Sharma',
    'Priya Patel',
    'Alex Morgan',
    'Sarah Chen',
    'David Miller',
    'Ananya Gupta',
    'Vikram Singh',
  ];
  const initialName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
  const initialPhone = `9198${Math.floor(10000000 + Math.random() * 90000000)}`;
  const initialOrderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenWA Webhook Echo & Live Inspector</title>
  <style>
    :root {
      --bg-dark: #090d16;
      --bg-panel: #0f172a;
      --bg-card: #162032;
      --bg-card-hover: #1e2c45;
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: #38bdf8;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #25d366;
      --primary-glow: rgba(37, 211, 102, 0.2);
      --accent: #38bdf8;
      --method-get: #38bdf8;
      --method-post: #22c55e;
      --method-put: #f59e0b;
      --method-patch: #a855f7;
      --method-delete: #ef4444;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Top Navigation Bar */
    header {
      background: rgba(15, 23, 42, 0.95);
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      backdrop-filter: blur(12px);
      z-index: 10;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: bold;
      color: #fff;
      box-shadow: 0 0 12px var(--primary-glow);
    }

    .brand-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .brand-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
      text-transform: uppercase;
    }

    .url-bar-container {
      flex: 1;
      max-width: 580px;
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.35rem 0.65rem;
      gap: 0.5rem;
    }

    .url-prefix {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      white-space: nowrap;
    }

    .url-text {
      font-family: var(--font-mono);
      font-size: 0.82rem;
      color: #38bdf8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .btn-copy-url {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
      border-radius: 5px;
      padding: 0.2rem 0.6rem;
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .btn-copy-url:hover {
      background: #38bdf8;
      color: #0f172a;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .live-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #4ade80;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.25);
      padding: 0.3rem 0.65rem;
      border-radius: 9999px;
    }

    .live-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 12px #22c55e; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    .btn-nav-dashboard {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s;
    }

    .btn-nav-dashboard:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Main Workspace Layout */
    .workspace {
      display: flex;
      flex: 1;
      height: calc(100vh - 57px);
      overflow: hidden;
    }

    /* Left Sidebar: Requests Feed */
    .sidebar {
      width: 360px;
      background: var(--bg-panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      background: rgba(15, 23, 42, 0.6);
    }

    .sidebar-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sidebar-title {
      font-size: 0.82rem;
      font-weight: 700;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .count-badge {
      font-size: 0.68rem;
      font-weight: 700;
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      padding: 0.1rem 0.45rem;
      border-radius: 9999px;
    }

    .btn-clear {
      background: transparent;
      border: none;
      color: #f87171;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }

    .btn-clear:hover {
      background: rgba(239, 68, 68, 0.15);
    }

    .search-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.45rem 0.65rem;
      color: #fff;
      font-size: 0.78rem;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .requests-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .request-item {
      padding: 0.65rem 0.8rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .request-item:hover {
      background: var(--bg-card-hover);
      border-color: rgba(56, 189, 248, 0.3);
    }

    .request-item.active {
      background: rgba(56, 189, 248, 0.1);
      border-color: var(--accent);
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
    }

    .request-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .method-badge {
      font-size: 0.65rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-family: var(--font-mono);
      letter-spacing: 0.05em;
    }

    .method-get { background: rgba(56, 189, 248, 0.18); color: var(--method-get); }
    .method-post { background: rgba(34, 197, 94, 0.18); color: var(--method-post); }
    .method-put { background: rgba(245, 158, 11, 0.18); color: var(--method-put); }
    .method-patch { background: rgba(168, 85, 247, 0.18); color: var(--method-patch); }
    .method-delete { background: rgba(239, 68, 68, 0.18); color: var(--method-delete); }

    .request-path {
      font-family: var(--font-mono);
      font-size: 0.74rem;
      color: #cbd5e1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .request-time {
      font-size: 0.68rem;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .request-item-preview {
      font-size: 0.7rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty-sidebar {
      padding: 2rem 1rem;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.78rem;
      line-height: 1.5;
    }

    /* Right Main Inspector Panel */
    .inspector-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-dark);
    }

    .inspector-header {
      padding: 1rem 1.25rem;
      background: rgba(15, 23, 42, 0.7);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .inspector-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .status-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 5px;
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .inspector-url {
      font-family: var(--font-mono);
      font-size: 0.88rem;
      font-weight: 600;
      color: #fff;
    }

    .inspector-ip-time {
      font-size: 0.74rem;
      color: var(--text-muted);
    }

    .inspector-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-action {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: #cbd5e1;
      padding: 0.35rem 0.7rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .btn-action:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.25);
    }

    /* Inspector Navigation Tabs */
    .tabs-bar {
      display: flex;
      align-items: center;
      background: rgba(15, 23, 42, 0.85);
      border-bottom: 1px solid var(--border);
      padding: 0 1.25rem;
      gap: 0.25rem;
    }

    .tab-btn {
      padding: 0.75rem 1rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
    }

    .tab-btn:hover {
      color: #fff;
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
    }

    /* JSON & Code Viewer */
    .code-box {
      background: #060911;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      font-family: var(--font-mono);
      font-size: 0.82rem;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre-wrap;
      line-height: 1.6;
    }

    /* Tables */
    .kv-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .kv-table th, .kv-table td {
      padding: 0.65rem 0.9rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 0.8rem;
    }

    .kv-table th {
      background: rgba(30, 41, 59, 0.5);
      font-weight: 700;
      color: #cbd5e1;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .kv-table td.key-col {
      font-family: var(--font-mono);
      color: #a78bfa;
      font-weight: 600;
      width: 35%;
    }

    .kv-table td.val-col {
      font-family: var(--font-mono);
      color: #e2e8f0;
      word-break: break-all;
    }

    /* Interactive Test Sender Form */
    .test-sender-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 760px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #cbd5e1;
    }

    .form-row {
      display: flex;
      gap: 0.5rem;
    }

    .form-select, .form-input, .form-textarea {
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: #fff;
      padding: 0.5rem 0.75rem;
      font-size: 0.82rem;
      outline: none;
      font-family: inherit;
    }

    .form-select {
      font-weight: 700;
      cursor: pointer;
      width: 120px;
    }

    .form-textarea {
      font-family: var(--font-mono);
      resize: vertical;
      min-height: 120px;
      line-height: 1.5;
    }

    .form-select:focus, .form-input:focus, .form-textarea:focus {
      border-color: var(--accent);
    }

    .btn-send-test {
      background: linear-gradient(135deg, #25d366 0%, #16a34a 100%);
      border: none;
      color: #0f172a;
      padding: 0.65rem 1.25rem;
      border-radius: 6px;
      font-weight: 800;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      align-self: flex-start;
      transition: all 0.15s ease;
      box-shadow: 0 2px 10px rgba(37, 211, 102, 0.25);
    }

    .btn-send-test:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .preset-chips {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.2rem;
    }

    .preset-chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.2rem 0.5rem;
      font-size: 0.7rem;
      color: var(--accent);
      cursor: pointer;
    }

    .preset-chip:hover {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--accent);
    }

    /* Workflow Integration Guide Card */
    .guide-card {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 10px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      max-width: 760px;
    }

    .guide-step {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
    }

    .guide-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.2);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .guide-text {
      font-size: 0.82rem;
      color: #cbd5e1;
      line-height: 1.5;
    }

    .guide-code {
      font-family: var(--font-mono);
      background: rgba(0, 0, 0, 0.4);
      color: #38bdf8;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      font-size: 0.78rem;
    }

    /* Toast Notification */
    #toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: #1e293b;
      border: 1px solid #38bdf8;
      color: #fff;
      padding: 0.65rem 1rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      display: none;
      z-index: 100;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header>
    <div class="brand-group">
      <div class="brand-logo">⚡</div>
      <div class="brand-title">
        OpenWA Webhook Tester & Echo
        <span class="brand-badge">Live UI</span>
      </div>
    </div>

    <div class="url-bar-container" title="Click to copy endpoint URL">
      <span class="url-prefix">Webhook URL:</span>
      <span id="endpoint-url-display" class="url-text">${currentUrl}</span>
      <button id="btn-copy-url" class="btn-copy-url">Copy URL</button>
    </div>

    <div class="header-actions">
      <div class="live-status-pill">
        <span class="live-pulse"></span>
        <span id="poll-status-text">Live (2s)</span>
      </div>
      <a href="http://localhost:2886/workflows" class="btn-nav-dashboard" title="Open Visual Workflow Builder in Dashboard">
        Visual Builder ↗
      </a>
    </div>
  </header>

  <!-- Workspace -->
  <div class="workspace">
    <!-- Left Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-meta-row">
          <span class="sidebar-title">
            📥 Captured Requests
            <span id="req-count-badge" class="count-badge">0</span>
          </span>
          <button id="btn-clear-requests" class="btn-clear">Clear All</button>
        </div>
        <input
          type="text"
          id="filter-input"
          class="search-input"
          placeholder="Filter by method, path, or body..."
        />
      </div>

      <div id="requests-list" class="requests-list">
        <!-- Rendered by JavaScript -->
      </div>
    </aside>

    <!-- Right Main Inspector Panel -->
    <main class="inspector-panel">
      <!-- Request Meta Header -->
      <div class="inspector-header">
        <div class="inspector-meta">
          <span id="active-method-badge" class="method-badge method-get">GET</span>
          <span id="active-status-badge" class="status-badge">200 OK (Echoed)</span>
          <span id="active-url" class="inspector-url">/api/webhook-test/echo</span>
          <span id="active-ip-time" class="inspector-ip-time">Client: 127.0.0.1 · Just now</span>
        </div>

        <div class="inspector-actions">
          <button id="btn-copy-curl" class="btn-action">📋 Copy cURL</button>
          <button id="btn-copy-json" class="btn-action">📋 Copy JSON</button>
          <button id="btn-resend-test" class="btn-action">🚀 Resend / Test</button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="tabs-bar">
        <button id="tab-btn-body" class="tab-btn active" data-tab="body-tab">📦 Request Body</button>
        <button id="tab-btn-query" class="tab-btn" data-tab="query-tab">🔍 Query Params</button>
        <button id="tab-btn-headers" class="tab-btn" data-tab="headers-tab">📑 Headers</button>
        <button id="tab-btn-test" class="tab-btn" data-tab="test-tab">🧪 Send Test Webhook</button>
        <button id="tab-btn-guide" class="tab-btn" data-tab="guide-tab">📖 Workflow Guide</button>
      </div>

      <!-- Tab Content Area -->
      <div class="tab-content">
        <!-- Tab 1: Request Body -->
        <div id="body-tab" class="tab-panel">
          <pre id="code-body-preview" class="code-box">No request body provided</pre>
        </div>

        <!-- Tab 2: Query Params -->
        <div id="query-tab" class="tab-panel" style="display: none;">
          <table class="kv-table">
            <thead>
              <tr>
                <th style="width: 35%">Parameter</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody id="query-table-body">
              <tr><td colspan="2" style="color: var(--text-muted); text-align: center;">No query parameters</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Tab 3: Headers -->
        <div id="headers-tab" class="tab-panel" style="display: none;">
          <table class="kv-table">
            <thead>
              <tr>
                <th style="width: 35%">Header Name</th>
                <th>Header Value</th>
              </tr>
            </thead>
            <tbody id="headers-table-body">
              <!-- Rendered by JS -->
            </tbody>
          </table>
        </div>

        <!-- Tab 4: Send Test Webhook -->
        <div id="test-tab" class="tab-panel" style="display: none;">
          <div class="test-sender-box">
            <h3 style="font-size: 0.95rem; font-weight: 700; color: #fff;">Send a Live Test Request to this Endpoint</h3>
            <p style="font-size: 0.78rem; color: var(--text-muted);">
              Use this interactive test tool to trigger incoming webhooks and see how OpenWA captures headers, query parameters, and JSON payloads.
            </p>

            <div class="form-group">
              <label class="form-label">HTTP Method & Path</label>
              <div class="form-row">
                <select id="test-method" class="form-select">
                  <option value="POST" selected>POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input id="test-path" class="form-input" style="flex: 1;" type="text" value="/api/webhook-test/echo" />
              </div>
            </div>

            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="form-label">JSON Request Body</label>
                <div class="preset-chips">
                  <span class="preset-chip" data-sample="order">+ Order Template</span>
                  <span class="preset-chip" data-sample="lead">+ Lead Template</span>
                  <span class="preset-chip" data-sample="payment">+ Payment Template</span>
                </div>
              </div>
              <textarea id="test-body" class="form-textarea" placeholder='{ "phone": "919876543210", "message": "Order tracking" }'>{
  "phone": "${initialPhone}",
  "name": "${initialName}",
  "orderId": "${initialOrderId}",
  "amount": 1499,
  "status": "shipped",
  "courier": "BlueDart"
}</textarea>
            </div>

            <button type="button" id="btn-send-test" class="btn-send-test">
              🚀 Send Webhook Request
            </button>
          </div>
        </div>

        <!-- Tab 5: Workflow Integration Guide -->
        <div id="guide-tab" class="tab-panel" style="display: none;">
          <div class="guide-card">
            <h3 style="font-size: 0.95rem; font-weight: 700; color: #fff;">Using this Webhook in OpenWA Workflows</h3>
            <div class="guide-step">
              <div class="guide-num">1</div>
              <div class="guide-text">
                In the OpenWA Visual Workflow Builder (<a href="http://localhost:2886/workflows" target="_blank" style="color: #38bdf8;">http://localhost:2886/workflows</a>), add a <strong>Webhook / API Call</strong> node.
              </div>
            </div>
            <div class="guide-step">
              <div class="guide-num">2</div>
              <div class="guide-text">
                Set the <strong>Endpoint URL</strong> to: <br/>
                <code class="guide-code">${currentUrl}</code>
              </div>
            </div>
            <div class="guide-step">
              <div class="guide-num">3</div>
              <div class="guide-text">
                Send dynamic variables in the JSON body:
                <pre class="code-box" style="margin-top: 0.4rem; padding: 0.6rem; font-size: 0.75rem;">{
  "phone": "{{trigger.phone}}",
  "name": "{{trigger.contactName}}",
  "message": "{{trigger.message}}",
  "orderId": "{{steps.ask_order.answer}}"
}</pre>
              </div>
            </div>
            <div class="guide-step">
              <div class="guide-num">4</div>
              <div class="guide-text">
                In downstream nodes (Condition Branch, Send Message, AI Assistant), read any echoed property using:
                <br/><code class="guide-code">{{steps.&lt;nodeId&gt;.data.status}}</code> or <code class="guide-code">{{steps.&lt;nodeId&gt;.data.orderId}}</code>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <div id="toast"></div>

  <script${nonceAttr}>
    // Initial data injected from backend controller
    let requestsHistory = ${safeHistory};
    let activeRequest = ${safeSelected};
    let isAutoPolling = true;

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2200);
    }

    function copyWebhookUrl() {
      const url = document.getElementById('endpoint-url-display').textContent;
      navigator.clipboard.writeText(url);
      showToast('Webhook URL copied to clipboard!');
    }

    function copyCurlCommand() {
      if (!activeRequest) return;
      const url = window.location.origin + activeRequest.url;
      const method = activeRequest.method;
      let curl = \`curl -X \${method} "\${url}"\`;
      
      if (activeRequest.headers) {
        for (const [k, v] of Object.entries(activeRequest.headers)) {
          if (!['host', 'content-length', 'connection'].includes(k.toLowerCase())) {
            curl += \` \\\n  -H "\${k}: \${v}"\`;
          }
        }
      }
      
      if (activeRequest.body && method !== 'GET') {
        const bodyStr = typeof activeRequest.body === 'object' ? JSON.stringify(activeRequest.body) : String(activeRequest.body);
        curl += \` \\\n  -d '\${bodyStr.replace(/'/g, "\\\\'")}'\`;
      }
      
      navigator.clipboard.writeText(curl);
      showToast('cURL command copied to clipboard!');
    }

    function copyCurrentBody() {
      if (!activeRequest || !activeRequest.body) return;
      const text = typeof activeRequest.body === 'object' ? JSON.stringify(activeRequest.body, null, 2) : String(activeRequest.body);
      navigator.clipboard.writeText(text);
      showToast('JSON payload copied!');
    }

    function switchToTab(tabId) {
      document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      
      const panel = document.getElementById(tabId);
      if (panel) panel.style.display = 'block';

      if (tabId === 'body-tab') document.getElementById('tab-btn-body')?.classList.add('active');
      if (tabId === 'query-tab') document.getElementById('tab-btn-query')?.classList.add('active');
      if (tabId === 'headers-tab') document.getElementById('tab-btn-headers')?.classList.add('active');
      if (tabId === 'test-tab') document.getElementById('tab-btn-test')?.classList.add('active');
      if (tabId === 'guide-tab') document.getElementById('tab-btn-guide')?.classList.add('active');
    }

    function selectRequest(id) {
      const found = requestsHistory.find(r => r.id === id);
      if (found) {
        activeRequest = found;
        renderActiveRequest();
        renderRequestsList();
      }
    }

    function renderRequestsList() {
      const container = document.getElementById('requests-list');
      const badge = document.getElementById('req-count-badge');
      const filter = (document.getElementById('filter-input')?.value || '').toLowerCase().trim();

      const filtered = requestsHistory.filter(r => {
        if (!filter) return true;
        const method = (r.method || '').toLowerCase();
        const path = (r.url || r.path || '').toLowerCase();
        const body = typeof r.body === 'object' ? JSON.stringify(r.body).toLowerCase() : String(r.body || '').toLowerCase();
        return method.includes(filter) || path.includes(filter) || body.includes(filter);
      });

      badge.textContent = String(requestsHistory.length);

      if (filtered.length === 0) {
        container.innerHTML = \`
          <div class="empty-sidebar">
            <div style="font-size: 24px; margin-bottom: 0.5rem;">📭</div>
            <strong>No webhook requests yet</strong><br/>
            Send a test request or call this URL from a workflow to see it appear live.
          </div>
        \`;
        return;
      }

      container.innerHTML = filtered.map(req => {
        const isActive = activeRequest && activeRequest.id === req.id;
        const method = req.method.toUpperCase();
        const methodClass = 'method-' + method.toLowerCase();
        const timeStr = new Date(req.receivedAt).toLocaleTimeString();
        let preview = '';
        if (req.body) {
          preview = typeof req.body === 'object' ? JSON.stringify(req.body) : String(req.body);
        } else if (req.query && Object.keys(req.query).length > 0) {
          preview = '?' + new URLSearchParams(req.query).toString();
        }

        return \`
          <div class="request-item \${isActive ? 'active' : ''}" data-req-id="\${req.id}">
            <div class="request-item-top">
              <span class="method-badge \${methodClass}">\${method}</span>
              <span class="request-path">\${req.path || req.url}</span>
              <span class="request-time">\${timeStr}</span>
            </div>
            \${preview ? \`<div class="request-item-preview">\${preview}</div>\` : ''}
          </div>
        \`;
      }).join('');
    }

    function renderActiveRequest() {
      if (!activeRequest) {
        document.getElementById('active-method-badge').textContent = 'READY';
        document.getElementById('active-method-badge').className = 'method-badge method-get';
        document.getElementById('active-status-badge').textContent = '200 OK';
        document.getElementById('active-url').textContent = '/api/webhook-test/echo';
        document.getElementById('active-ip-time').textContent = 'Waiting for requests...';
        document.getElementById('code-body-preview').textContent = 'No requests captured yet. Use the "Send Test Webhook" tab or send a request via cURL/Workflow.';
        return;
      }

      const method = activeRequest.method.toUpperCase();
      const methodBadge = document.getElementById('active-method-badge');
      methodBadge.textContent = method;
      methodBadge.className = 'method-badge method-' + method.toLowerCase();

      document.getElementById('active-status-badge').textContent = '200 OK (Echoed)';
      document.getElementById('active-url').textContent = activeRequest.url || activeRequest.path;
      document.getElementById('active-ip-time').textContent = \`Client: \${activeRequest.ip} · \${new Date(activeRequest.receivedAt).toLocaleString()}\`;

      // Body preview
      const bodyEl = document.getElementById('code-body-preview');
      if (activeRequest.body !== null && activeRequest.body !== undefined && activeRequest.body !== '') {
        bodyEl.textContent = typeof activeRequest.body === 'object' ? JSON.stringify(activeRequest.body, null, 2) : String(activeRequest.body);
      } else {
        bodyEl.textContent = 'Empty payload (No request body received)';
      }

      // Query table
      const queryTbody = document.getElementById('query-table-body');
      const queryEntries = Object.entries(activeRequest.query || {});
      if (queryEntries.length === 0) {
        queryTbody.innerHTML = '<tr><td colspan="2" style="color: var(--text-muted); text-align: center;">No query parameters</td></tr>';
      } else {
        queryTbody.innerHTML = queryEntries.map(([k, v]) => \`
          <tr>
            <td class="key-col">\${escapeHtml(k)}</td>
            <td class="val-col">\${escapeHtml(String(v))}</td>
          </tr>
        \`).join('');
      }

      // Headers table
      const headersTbody = document.getElementById('headers-table-body');
      const headerEntries = Object.entries(activeRequest.headers || {});
      if (headerEntries.length === 0) {
        headersTbody.innerHTML = '<tr><td colspan="2" style="color: var(--text-muted); text-align: center;">No headers</td></tr>';
      } else {
        headersTbody.innerHTML = headerEntries.map(([k, v]) => \`
          <tr>
            <td class="key-col">\${escapeHtml(k)}</td>
            <td class="val-col">\${escapeHtml(String(v))}</td>
          </tr>
        \`).join('');
      }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function clearAllRequests() {
      try {
        await fetch('/api/webhook-test/requests', { method: 'DELETE' });
        requestsHistory = [];
        activeRequest = null;
        renderRequestsList();
        renderActiveRequest();
        showToast('Webhook history cleared');
      } catch (err) {
        showToast('Failed to clear history');
      }
    }

    const SAMPLE_NAMES = [
      'Rahul Sharma', 'Priya Patel', 'Alex Morgan', 'Sarah Chen',
      'David Miller', 'Ananya Gupta', 'Vikram Singh', 'Neha Verma', 'Amit Patel'
    ];

    function getRandomSampleUser() {
      const name = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
      const phone = '9198' + Math.floor(10000000 + Math.random() * 90000000);
      return { name, phone };
    }

    function loadSampleBody(type) {
      const textarea = document.getElementById('test-body');
      const sampleUser = getRandomSampleUser();
      if (type === 'order') {
        textarea.value = JSON.stringify({
          orderId: "ORD-" + Math.floor(1000 + Math.random() * 9000),
          status: "shipped",
          total: Math.floor(999 + Math.random() * 4000),
          customer: { name: sampleUser.name, phone: sampleUser.phone },
          trackingUrl: "https://track.courier.in/" + Math.floor(100000 + Math.random() * 900000)
        }, null, 2);
      } else if (type === 'lead') {
        textarea.value = JSON.stringify({
          leadId: "lead_" + Date.now(),
          name: sampleUser.name,
          phone: sampleUser.phone,
          interest: "WhatsApp Enterprise Automation",
          budget: "₹" + (Math.floor(15 + Math.random() * 35) * 1000).toLocaleString('en-IN'),
          source: "Website Chatbot"
        }, null, 2);
      } else if (type === 'payment') {
        textarea.value = JSON.stringify({
          paymentId: "pay_" + Math.random().toString(36).substring(2, 9),
          orderId: "ORD-" + Math.floor(1000 + Math.random() * 9000),
          status: "captured",
          customer: { name: sampleUser.name, phone: sampleUser.phone },
          amount: Math.floor(499 + Math.random() * 2500) * 100,
          currency: "INR",
          method: "upi"
        }, null, 2);
      }
    }

    async function executeTestRequest() {
      const method = document.getElementById('test-method').value;
      const path = document.getElementById('test-path').value.trim() || '/api/webhook-test/echo';
      const bodyText = document.getElementById('test-body').value.trim();

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-OpenWA-Source': 'Interactive_Tester_UI',
        },
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && bodyText) {
        options.body = bodyText;
      }

      try {
        const res = await fetch(path, options);
        const data = await res.json();
        showToast(\`Request sent! Status: \${res.status}\`);
        await pollRequests();
        switchToTab('body-tab');
      } catch (err) {
        showToast('Failed to send request: ' + err.message);
      }
    }

    async function pollRequests() {
      try {
        const res = await fetch('/api/webhook-test/requests');
        if (!res.ok) return;
        const data = await res.json();
        const latestRequests = data.requests || [];
        
        // Check if new requests arrived
        if (latestRequests.length !== requestsHistory.length || (latestRequests[0] && latestRequests[0].id !== requestsHistory[0]?.id)) {
          requestsHistory = latestRequests;
          if (!activeRequest && requestsHistory.length > 0) {
            activeRequest = requestsHistory[0];
          }
          renderRequestsList();
          renderActiveRequest();
        }
      } catch {
        // Silently handle transient polling error
      }
    }

    // Wire up event listeners cleanly without inline handlers (CSP compliant)
    document.getElementById('btn-copy-url')?.addEventListener('click', copyWebhookUrl);
    document.getElementById('btn-clear-requests')?.addEventListener('click', clearAllRequests);
    document.getElementById('filter-input')?.addEventListener('input', renderRequestsList);
    document.getElementById('btn-copy-curl')?.addEventListener('click', copyCurlCommand);
    document.getElementById('btn-copy-json')?.addEventListener('click', copyCurrentBody);
    document.getElementById('btn-resend-test')?.addEventListener('click', () => switchToTab('test-tab'));
    document.getElementById('btn-send-test')?.addEventListener('click', executeTestRequest);

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) switchToTab(tabId);
      });
    });

    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const sampleType = chip.getAttribute('data-sample');
        if (sampleType) loadSampleBody(sampleType);
      });
    });

    document.getElementById('requests-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('.request-item');
      if (item && item.getAttribute('data-req-id')) {
        selectRequest(item.getAttribute('data-req-id'));
      }
    });

    // Initialize UI on load
    renderActiveRequest();
    renderRequestsList();

    // Auto-poll every 2.5 seconds
    setInterval(() => {
      if (isAutoPolling) {
        pollRequests();
      }
    }, 2500);
  </script>
</body>
</html>`;
}
