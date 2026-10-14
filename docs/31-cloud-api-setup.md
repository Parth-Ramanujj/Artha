# WhatsApp Cloud API Setup Guide

Step-by-step guide to connect Artha (OpenWA) with the **official WhatsApp Cloud API** (Meta Graph API). This engine uses Meta's own infrastructure — no Chromium, no QR code, no ban risk.

---

## Prerequisites

- A **Facebook account** (personal — used only to create the business assets)
- A **phone number** that can receive SMS or calls (for WhatsApp Business verification)
- Your Artha instance running and accessible via a **public HTTPS URL** (for webhooks)

---

## Step 1: Create a Meta Business Account

1. Go to [business.facebook.com](https://business.facebook.com)
2. Click **Create Account**
3. Fill in your business name, your name, and business email
4. Follow the verification steps

> If you already have a Meta Business account, skip to Step 2.

---

## Step 2: Create a Meta App

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Click **My Apps** (top right) → **Create App**
3. Select app type: **Business**
4. Fill in:
   - **App name**: e.g. `My WhatsApp Bot`
   - **App contact email**: your email
   - **Business Account**: select the one you created in Step 1
5. Click **Create App**

---

## Step 3: Add WhatsApp Product to Your App

1. In your app's dashboard, find **Add Products to Your App**
2. Find **WhatsApp** and click **Set Up**
3. You'll be redirected to the WhatsApp Getting Started page
4. Select or create a **Meta Business Account** to link

After setup, you'll see the **WhatsApp** section in the left sidebar.

---

## Step 4: Get Your API Credentials

Go to **WhatsApp** → **API Setup** in the left sidebar. You'll see:

### A. Temporary Access Token
- There's a **Temporary access token** shown on this page
- This token expires in 24 hours — fine for testing, but you'll need a permanent one for production (see Step 8)
- **Copy this token** → this is your `CLOUD_API_ACCESS_TOKEN`

### B. Phone Number ID
- Under **From**, you'll see a test phone number Meta provides
- Below it, you'll see the **Phone number ID** (a numeric string like `123456789012345`)
- **Copy this** → this is your `CLOUD_API_PHONE_NUMBER_ID`

### C. WhatsApp Business Account ID
- On the same page, find the **WhatsApp Business Account ID**
- Or go to **WhatsApp** → **Overview** and find it there
- **Copy this** → this is your `CLOUD_API_WABA_ID`

### D. App Secret
- Go to **Settings** → **Basic** (in the left sidebar)
- Find **App Secret** and click **Show**
- **Copy this** → this is your `CLOUD_API_APP_SECRET`

---

## Step 5: Configure Artha

Edit your `.env` file (or set environment variables):

```env
# Switch to the official Cloud API engine
ENGINE_TYPE=cloud-api

# Paste your credentials from Step 4
CLOUD_API_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLOUD_API_PHONE_NUMBER_ID=123456789012345
CLOUD_API_WABA_ID=109876543210
CLOUD_API_APP_SECRET=abcdef1234567890abcdef1234567890

# Choose any secret string for webhook verification (you'll use this in Step 6)
CLOUD_API_VERIFY_TOKEN=my-super-secret-verify-token-123
```

Restart Artha after saving.

---

## Step 6: Set Up the Webhook

Meta needs to send incoming messages to your server. Your Artha instance exposes the webhook at:

```
https://your-domain.com/api/cloud-api/webhook
```

### Configure in Meta Developer Portal:

1. Go to **WhatsApp** → **Configuration** in the left sidebar
2. Under **Webhook**, click **Edit**
3. Fill in:
   - **Callback URL**: `https://your-domain.com/api/cloud-api/webhook`
   - **Verify token**: the same value you set in `CLOUD_API_VERIFY_TOKEN` (e.g. `my-super-secret-verify-token-123`)
4. Click **Verify and Save**

   > Meta will send a GET request to your URL. If Artha is running and the verify token matches, it will respond correctly and Meta will confirm the webhook.

5. After verification, click **Manage** next to the Webhook fields
6. **Subscribe** to these webhook fields:
   - `messages` (required — incoming messages, reactions, delivery status)

> **Important**: Your server must be publicly accessible via HTTPS. If testing locally, use a tunnel like [ngrok](https://ngrok.com):
> ```bash
> ngrok http 2785
> ```
> Then use the ngrok HTTPS URL as your callback URL.

---

## Step 7: Add a Phone Number (Production)

Meta gives you a **test phone number** by default. To use your own business number:

1. Go to **WhatsApp** → **API Setup**
2. Click **Add phone number**
3. Fill in your business details:
   - Business name (as customers will see it)
   - Business category
   - Business description
4. Enter your phone number
5. Choose verification method: **SMS** or **Voice call**
6. Enter the verification code you receive
7. Your number is now linked

> **Note**: The phone number you add here **cannot** be simultaneously used with WhatsApp or WhatsApp Business apps. It becomes dedicated to the Cloud API.

---

## Step 8: Create a Permanent Access Token

The temporary token from Step 4 expires in 24 hours. For production, create a **System User** token:

1. Go to [business.facebook.com](https://business.facebook.com) → **Settings** (gear icon)
2. Go to **Users** → **System Users**
3. Click **Add** → create a system user:
   - Name: e.g. `artha-api`
   - Role: **Admin**
4. Click **Add Assets**:
   - Select **Apps** → your WhatsApp app → toggle **Full Control**
   - Select **WhatsApp Accounts** → your WABA → toggle **Full Control**
5. Click **Generate New Token**:
   - Select your app
   - Check these permissions:
     - `whatsapp_business_management`
     - `whatsapp_business_messaging`
   - Set expiration to **Never** (for a permanent token)
6. Click **Generate Token**
7. **Copy the token** immediately (it won't be shown again)
8. Update your `.env`:
   ```env
   CLOUD_API_ACCESS_TOKEN=EAAxxxxxxx_your_permanent_token_xxxxxxx
   ```
9. Restart Artha

---

## Step 9: Create Message Templates (Required for Starting Conversations)

The Cloud API requires **approved message templates** to start conversations with users who haven't messaged you in the last 24 hours. Within the 24-hour window after a user messages you, you can send any free-form message.

### Create a template:

1. Go to [business.facebook.com](https://business.facebook.com)
2. Navigate to **WhatsApp Manager** → **Message Templates**
3. Click **Create Template**
4. Fill in:
   - **Category**: Choose (Marketing, Utility, or Authentication)
   - **Name**: e.g. `hello_world` (lowercase, underscores only)
   - **Language**: Select your language(s)
5. Design your template:
   - **Header** (optional): text, image, video, or document
   - **Body**: your message text. Use `{{1}}`, `{{2}}` etc. for variables
   - **Footer** (optional): small text below the body
   - **Buttons** (optional): call-to-action or quick-reply buttons
6. Click **Submit for Review**
7. Wait for Meta to approve (usually within minutes, sometimes hours)

### Send a template via Artha's API:

The Cloud API adapter exposes a `sendTemplateMessage` method. Use the REST API:

```bash
# Send a template message
curl -X POST https://your-domain.com/api/sessions/{sessionId}/messages/text \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "chatId": "919876543210@c.us",
    "text": "Hello!"
  }'
```

For template messages specifically, use the Cloud API directly:

```bash
# Send via Graph API (template message)
curl -X POST "https://graph.facebook.com/v21.0/YOUR_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "919876543210",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": { "code": "en_US" }
    }
  }'
```

---

## Step 10: Test Your Setup

### A. Send a test message

1. Create a session via Artha's API:
   ```bash
   curl -X POST https://your-domain.com/api/sessions \
     -H "Content-Type: application/json" \
     -H "x-api-key: your-api-key" \
     -d '{"name": "main"}'
   ```

2. Start the session:
   ```bash
   curl -X POST https://your-domain.com/api/sessions/main/start \
     -H "x-api-key: your-api-key"
   ```
   
   The Cloud API engine doesn't need a QR scan — it connects immediately using your access token.

3. Send a message (to a number that has messaged you first, or use a template):
   ```bash
   curl -X POST https://your-domain.com/api/sessions/main/messages/text \
     -H "Content-Type: application/json" \
     -H "x-api-key: your-api-key" \
     -d '{
       "chatId": "919876543210@c.us",
       "text": "Hello from Artha Cloud API!"
     }'
   ```

### B. Receive a message

1. Send a WhatsApp message from your personal phone to the business number
2. Check your webhook logs — the message should appear in Artha's webhook events
3. If you have a webhook configured in Artha, it will forward the message to your webhook URL

---

## Quick Reference: Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ENGINE_TYPE` | Yes | Set to `cloud-api` |
| `CLOUD_API_ACCESS_TOKEN` | Yes | System user or temporary access token |
| `CLOUD_API_PHONE_NUMBER_ID` | Yes | Phone Number ID from Meta |
| `CLOUD_API_WABA_ID` | No | WhatsApp Business Account ID |
| `CLOUD_API_VERIFY_TOKEN` | Yes | Your chosen secret for webhook verification |
| `CLOUD_API_APP_SECRET` | Recommended | Meta App Secret (for webhook signature validation) |
| `CLOUD_API_GRAPH_VERSION` | No | Graph API version (default: `v21.0`) |
| `CLOUD_API_DATA_DIR` | No | Data directory (default: `./data/cloud-api`) |

---

## Supported Features (Cloud API vs Unofficial Engines)

| Feature | Cloud API | whatsapp-web.js | Baileys |
|---|---|---|---|
| Text messages | Yes | Yes | Yes |
| Image/Video/Audio/Document | Yes | Yes | Yes |
| Stickers | Yes | Yes | Yes |
| Location | Yes | Yes | Yes |
| Contacts | Yes | Yes | Yes |
| Reactions | Yes | Yes | Yes |
| Reply to message | Yes | Yes | Yes |
| Template messages | **Yes** | No | No |
| Interactive messages | **Yes** | No | No |
| No QR scan needed | **Yes** | No | No |
| No ban risk | **Yes** | Medium | High |
| Groups management | No | Yes | Yes |
| Contacts list | No | Yes | Yes |
| Chat history | No | Yes | Partial |
| Status/Stories | No | Yes | Yes |
| Labels | No | Yes | Partial |
| Channels | No | Yes | Partial |
| Polls | No | Yes | Yes |
| Forward messages | No | Yes | Yes |
| Edit/Delete messages | No | Yes | Yes |
| Profile management | No | Yes | Yes |

---

## Troubleshooting

### Webhook verification fails
- Make sure your server is publicly accessible via HTTPS
- Check that `CLOUD_API_VERIFY_TOKEN` in your `.env` matches exactly what you entered in Meta
- Check Artha logs for `cloud_api_webhook_verify_failed`

### Messages not being received
- Verify you subscribed to the `messages` field in Meta's webhook configuration
- Check that your app is not in **Development** mode for production use (go to App Dashboard → toggle **Live** mode)
- Check Artha logs for `cloud_api_webhook_error`

### "Access token has expired"
- Replace the temporary token with a permanent System User token (Step 8)
- Restart Artha after updating the token

### "Re-engage conversation requires template"
- You can only send free-form messages within 24 hours of the user's last message
- After 24 hours, you must use an approved message template

### Webhook signature validation fails
- Ensure `CLOUD_API_APP_SECRET` matches your app's secret from Settings → Basic
- Make sure your server has `rawBody` parsing enabled (Artha handles this automatically)

---

## Cost

The WhatsApp Cloud API has a **conversation-based pricing** model:

- **Business-initiated** conversations (you message first with a template): paid per conversation
- **User-initiated** conversations (user messages you first): paid per conversation
- **Free tier**: 1,000 free service conversations per month
- Pricing varies by country — see [Meta's pricing page](https://developers.facebook.com/docs/whatsapp/pricing)

The Cloud API itself is free to use — you only pay for conversations.
