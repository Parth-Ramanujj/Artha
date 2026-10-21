# AI Calling Agent Setup Guide

Step-by-step guide to let the AI agent phone your leads in **Gujarati and Hindi**, have a natural conversation, log every call with a transcript and summary, and turn interested people into **verified leads** (with an optional WhatsApp follow-up).

The same checklist is shown live inside the dashboard under **AI Calling** (it ticks off each step as you finish it).

---

## What you need

| Service | What it does | Cost to start |
|---|---|---|
| [Sarvam AI](https://dashboard.sarvam.ai) | Hears the customer (speech-to-text) and speaks (Gujarati/Hindi voices) | Free credits on sign-up |
| [Groq](https://console.groq.com/keys) | The agent's "brain" (language model) | Free key |
| [Twilio](https://console.twilio.com) | Places the phone call | Free trial (calls verified numbers only) |
| A public HTTPS address | Lets Twilio reach your server | Free with Cloudflare Tunnel |

Steps 1–2 are enough to talk to the agent from your browser (**Test call** tab). Steps 3–5 are needed for real phone calls.

---

## Step 1: Sarvam key (voice)

1. Sign in at [dashboard.sarvam.ai](https://dashboard.sarvam.ai) → **API Keys** → create a key.
2. Add it to the server's `.env`:
   ```
   SARVAM_API_KEY=sk_...
   ```

## Step 2: Groq key (AI brain)

1. Sign in at [console.groq.com/keys](https://console.groq.com/keys) → **Create API Key**.
2. Add it to `.env`:
   ```
   GROQ_API_KEY=gsk_...
   ```
3. **Restart the server** (keys are read at start-up), open **AI Calling**, press **Re-check**.
4. Open the **Test call** tab and talk to the agent through your microphone.

## Step 3: Twilio account and number

1. Sign up at [console.twilio.com](https://console.twilio.com). On the dashboard copy the **Account SID** and **Auth Token**.
2. Get a phone number: **Phone Numbers → Manage → Buy a number** (trial accounts get one free).
3. Add to `.env` (number in international format, with `+`):
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+1...
   ```
4. Restart the server.

### Trial accounts only

- A trial account can only call numbers you verified: **Phone Numbers → Manage → Verified Caller IDs → Add**.
- The person hears a short Twilio trial message first and must **press any key** — only then does the AI start talking.
- Upgrade the Twilio account to call any number without the message.

## Step 4: Public HTTPS address

Twilio must reach your server over HTTPS **and WebSockets** (the live audio stream). The easiest way is a free Cloudflare tunnel:

```bash
cloudflared tunnel --url http://localhost:2785
```

(Use your server's port if it is not 2785 — the dashboard shows the exact command.)

Copy the `https://….trycloudflare.com` address it prints, paste it into **AI Calling → setup → Public address**, and press **Save** (admins only). Alternatively set `AI_CALLING_PUBLIC_URL=` in `.env`.

> A quick tunnel gets a **new address every time it restarts** — paste the new one each time, or use a named Cloudflare tunnel / your own domain for production.

## Step 5: First real call

1. **AI Calling → Call log → AI call this number** → enter your own (verified) number.
2. Answer, (trial: press a key), and talk.
3. When the call ends, open it in the call log: transcript, summary, sentiment, and whether it is a verified lead.

---

## Configure the agent

**AI Calling → Agent settings**:

- **Who it is**: persona name, company, greeting (`{name}`, `{persona}`, `{company}` are filled in).
- **What it does**: the script in plain language, and when a call counts as a **verified lead**.
- **Voice**: opening language, Gujarati and Hindi voices, speaking speed. The agent switches language when the customer does, and adjusts its tone (warm, calm, empathetic, brisk, cheerful) to the customer's mood on its own.
- **Calling rules**: calling hours and time zone (default 09:00–21:00 India), calls at the same time (trial: 1), attempts per number and the wait before retrying busy/unanswered numbers.
- **WhatsApp follow-up**: message sent to verified leads, and which WhatsApp number sends it.

## Calling a list

**Call lists → Upload** a CSV or Excel file with a phone column (and optionally a name column), preview it, and **Start calling**. Lists can be paused, resumed or cancelled. Numbers that opted out (WhatsApp DND, opt-out consent, or said "don't call me" on an earlier call) are skipped automatically, and a "don't call me" on a call also stops WhatsApp campaigns to that number.

---

## Troubleshooting

| What you see on a call | Why | Fix |
|---|---|---|
| `Waiting: Twilio is not configured` | Twilio keys missing | Step 3, restart |
| `Waiting: set the public https address` | No tunnel address saved | Step 4 |
| `Waiting: outside calling hours` | Outside the agent's calling hours | Wait, or change the hours |
| `Waiting: the agent is already on N call(s)` | Concurrency limit reached | Normal; raise "calls at the same time" on a paid Twilio account |
| `The call ended before it reached the AI` | Trial: the key was not pressed after Twilio's message | Press any key after the message |
| `The audio stream to the AI never opened` | Tunnel down, or it does not pass WebSockets | Restart the tunnel, save the new address |
| `SARVAM_API_KEY is not set` | Voice key missing | Step 1, restart |
| `The language model did not answer` | Groq key invalid or rate-limited | Check the key, add `GROQ_API_KEY_1`… for more capacity |
| Public address check is red | Tunnel stopped or address changed | Restart the tunnel, paste the new address |
