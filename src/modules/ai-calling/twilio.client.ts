import { TelephonyApiError, type TelephonyProvider } from './telephony-types';
import { createHmac, timingSafeEqual } from 'crypto';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface TwilioCallResult {
  sid: string;
  status: string;
}

export interface TwilioNotification {
  errorCode: string;
  messageText: string;
  logLevel: string;
  dateCreated: string;
  callSid?: string;
}

export class TwilioApiError extends TelephonyApiError {}

const API = 'https://api.twilio.com/2010-04-01';

export function twilioConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = env.TWILIO_PHONE_NUMBER?.trim();
  return accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : null;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/**
 * TwiML that connects the answered call to our media stream; the token travels as a stream parameter.
 * The <Say> after <Connect> only plays if the stream could not be opened, instead of a silent hang-up.
 */
export function streamTwiml(streamUrl: string, params: Record<string, string>, statusCallback?: string): string {
  const callback = statusCallback ? ` statusCallback="${escapeXml(statusCallback)}" statusCallbackMethod="POST"` : '';
  const parameters = Object.entries(params)
    .map(([name, value]) => `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapeXml(streamUrl)}"${callback}>${parameters}</Stream></Connect><Say>Sorry, the assistant could not be connected. We will call you back.</Say></Response>`;
}

/**
 * Twilio's X-Twilio-Signature: base64 HMAC-SHA1 over the full callback URL followed by every POST
 * parameter name and value, sorted by name.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + (params[key] ?? ''), url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export class TwilioClient implements TelephonyProvider {
  readonly name = 'twilio';

  constructor(private readonly config: TwilioConfig) {}

  private get auth(): string {
    return `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`;
  }

  private async post(path: string, form: Record<string, string | string[]>): Promise<Record<string, unknown>> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      for (const v of Array.isArray(value) ? value : [value]) body.append(key, v);
    }
    const res = await fetch(`${API}/Accounts/${this.config.accountSid}${path}`, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new TwilioApiError(
        typeof json.message === 'string' ? json.message : `Twilio returned HTTP ${res.status}`,
        res.status,
        typeof json.code === 'number' ? json.code : undefined,
      );
    }
    return json;
  }

  /**
   * Places a call whose instructions Twilio fetches from `twimlUrl` once it is answered. Only
   * parameters trial accounts accept are sent: they reject Twiml, Method, Timeout and
   * StatusCallbackMethod, and the defaults (POST, 60 s ring) are what we want anyway.
   */
  async createCall(input: { to: string; twimlUrl: string; statusCallback?: string }): Promise<TwilioCallResult> {
    const form: Record<string, string | string[]> = {
      To: input.to,
      From: this.config.fromNumber,
      Url: input.twimlUrl,
    };
    if (input.statusCallback) {
      form.StatusCallback = input.statusCallback;
      form.StatusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
    }
    const json = await this.post('/Calls.json', form);
    return { sid: String(json.sid), status: String(json.status) };
  }

  /** A call's current status and duration, for when its status callback never arrived. */
  async getCall(callSid: string): Promise<{ status: string; duration: string | null }> {
    const res = await fetch(`${API}/Accounts/${this.config.accountSid}/Calls/${callSid}.json`, {
      headers: { Authorization: this.auth },
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok)
      throw new TwilioApiError(typeof json.message === 'string' ? json.message : `HTTP ${res.status}`, res.status);
    return { status: String(json.status), duration: typeof json.duration === 'string' ? json.duration : null };
  }

  async hangup(callSid: string): Promise<void> {
    await this.post(`/Calls/${callSid}.json`, { Status: 'completed' });
  }

  private async getJson(path: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
    const res = await fetch(`${API}/Accounts/${this.config.accountSid}${path}`, {
      headers: { Authorization: this.auth },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new TwilioApiError(typeof json.message === 'string' ? json.message : `HTTP ${res.status}`, res.status);
    }
    return json;
  }

  /** Account type ("Trial"/"Full") and whether the configured From number belongs to it. */
  async check(): Promise<{ accountType: string; fromNumberOwned: boolean; verifiedCallerIds: number }> {
    const account = await this.getJson('.json');
    const numbers = await this.getJson(
      `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(this.config.fromNumber)}`,
    );
    const callerIds = await this.getJson('/OutgoingCallerIds.json');
    return {
      accountType: typeof account.type === 'string' ? account.type : 'unknown',
      fromNumberOwned: Array.isArray(numbers.incoming_phone_numbers) && numbers.incoming_phone_numbers.length > 0,
      verifiedCallerIds: Array.isArray(callerIds.outgoing_caller_ids) ? callerIds.outgoing_caller_ids.length : 0,
    };
  }

  /** Fetch Twilio Debugger notifications recorded for a specific CallSid. */
  async getCallNotifications(callSid: string): Promise<TwilioNotification[]> {
    try {
      const json = await this.getJson(`/Calls/${encodeURIComponent(callSid)}/Notifications.json?PageSize=10`, 4000);
      return parseNotifications(json.notifications);
    } catch {
      return [];
    }
  }

  /** Fetch recent Twilio account Debugger notifications (errors/warnings). */
  async getRecentNotifications(limit = 5): Promise<TwilioNotification[]> {
    try {
      const json = await this.getJson(`/Notifications.json?PageSize=${Math.max(1, Math.min(limit, 20))}`, 5000);
      return parseNotifications(json.notifications);
    } catch {
      return [];
    }
  }
}

function parseNotifications(raw: unknown): TwilioNotification[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      const row = item as Record<string, unknown>;
      return {
        errorCode: typeof row.error_code === 'string' ? row.error_code : String(row.error_code ?? ''),
        messageText: typeof row.message_text === 'string' ? row.message_text.trim() : '',
        logLevel: typeof row.log === 'string' ? row.log : '',
        dateCreated: typeof row.date_created === 'string' ? row.date_created : '',
        callSid: typeof row.call_sid === 'string' ? row.call_sid : undefined,
      };
    })
    .filter(n => n.errorCode || n.messageText);
}
