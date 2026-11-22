# OpenWA / Artha — Cross-Platform Mobile Application (Android & iOS)

A dark-first, obsidian-styled multi-tenant omnichannel SaaS mobile application built with **React Native (Expo SDK 58)** and **TypeScript**, reproducing the Google Stitch UI screen designs with 100% visual and functional fidelity.

---

## 📱 Features & Modules

1. **Omnichannel Hub (`HubScreen`)**:
   - Quick stats horizontal carousel (Delivered messages, open conversations, Google rating, health).
   - Connected official channels:
     - WhatsApp Official (Meta Cloud API) with live `WORKING` indicator.
     - Instagram Business (`@handle`, DM auto-reply status).
     - Facebook Page (Lead Ads auto-sync).
     - Google Business Profile (Star rating & automated review response).
   - Multi-channel recent activity feed with relative time stamps.
   - Emerald glowing Floating Action Button (`+`).

2. **Unified Omnichannel Inbox (`InboxScreen`)**:
   - Platform filtering tabs: All, WhatsApp, Instagram, Google.
   - Search bar across contact names and message history.
   - Interactive conversation view with WhatsApp Cloud API outgoing bubble styling and delivery ticks.

3. **CRM Sales Pipeline Kanban (`CrmScreen`)**:
   - Metrics bar showing total pipeline value in INR (`₹18,45,000`) and active deal counts.
   - Channels filtering (WhatsApp Leads, Instagram DMs, High Priority 🔥).
   - Horizontal swipeable Kanban columns (`New Leads`, `Qualified`, `Proposal`, `Deals Won`).
   - One-tap deal progression buttons (`Qualify →`, `Proposal →`, `Mark Won ★`).

4. **Automations & AI Hub (`AutomationsScreen`)**:
   - **Workflows**: Node triggers (`WHEN` -> `THEN`) with interactive toggle switches.
   - **Social Scheduler**: Post queue for Instagram & Facebook with scheduled delivery status.
   - **Astra AI Agent**: Live Gemini LLM system prompt customization and knowledge base activation.
   - **Voice Hub**: Missed call recovery via automated WhatsApp Cloud API triggers.

5. **Tenant Gateway & Settings (`SettingsScreen`)**:
   - **Multi-Tenant Workspace Switcher**: Switch between active tenant workspaces (e.g., Sunrise Retailers, Surat Hub, Artha D2C).
   - **Provision New Tenant**: Add new tenant organizations with customizable subscription plans (Starter, Growth, Enterprise).
   - **Backend API Gateway**: Configurable Server URL and API key with AES-256 secure storage (`expo-secure-store`). Zero hardcoded secrets.
   - **Webhook Inspector**: Real-time event log stream (Meta Graph API, Pub/Sub, status updates).

6. **Connect Channel Modal (`ConnectChannelModal`)**:
   - Bottom sheet modal matching `openwa_artha_connect_channel_sheet`.
   - Official credentials setup for Meta Cloud API (Token, Phone Number ID, WABA ID) with show/hide password toggle.
   - Meta Social OAuth, Google Business Profile, and Telegram Bot connection tabs.

---

## 🚀 How to Run the App on Android & iPhone

### 1. Start the Expo Development Server
In your terminal, navigate to the `mobile` folder and run:

```powershell
cd D:\testing\OpenWA\mobile
npm start
```

### 2. Preview on Your Physical Phone (Android & iPhone)
1. Install the free **Expo Go** app from the Google Play Store (Android) or App Store (iOS).
2. Ensure your phone and development PC are connected to the same Wi-Fi network.
3. Open **Expo Go** and scan the QR code displayed in the terminal:
   - On Android: Scan directly inside Expo Go.
   - On iPhone: Open the default Camera app and scan the QR code to open in Expo Go.

### 3. Connect to Your Local OpenWA Backend
1. In the mobile app, tap the **Settings** tab.
2. In **OpenWA Server URL**, replace `http://localhost:2785` with your computer's local LAN IP (e.g. `http://192.168.1.5:2785`).
3. Tap **Test Ping** to confirm live connectivity!
