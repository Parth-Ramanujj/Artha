import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { Integration, IntegrationStatus, IntegrationType } from '../entities/integration.entity';
import { decryptSecret, encryptSecret } from './google-token-crypto';
import { cellMatches, fieldKey, suggestKeyColumn } from './sheet-lookup';

/** The Google services one account can be connected for, and the OAuth scope each one needs. */
export const GOOGLE_SERVICES = {
  gmail: { label: 'Gmail (send email)', name: 'Gmail', scope: 'https://www.googleapis.com/auth/gmail.send' },
  calendar: {
    label: 'Google Calendar',
    name: 'Google Calendar',
    scope: 'https://www.googleapis.com/auth/calendar.events',
  },
  sheets: { label: 'Google Sheets', name: 'Google Sheets', scope: 'https://www.googleapis.com/auth/spreadsheets' },
  drive: {
    label: 'Google Drive (files the app creates)',
    name: 'Google Drive',
    scope: 'https://www.googleapis.com/auth/drive.file',
  },
} as const;

export type GoogleServiceId = keyof typeof GOOGLE_SERVICES;

/** Extra read-only scopes a service needs for listing things (e.g. finding spreadsheets by name). */
const EXTRA_SCOPES: Partial<Record<GoogleServiceId, string[]>> = {
  sheets: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
};
const LIST_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';

/** Each Google service is its own integration type, so each one connects and is managed on its own. */
export const GOOGLE_TYPE_SERVICE: Record<string, GoogleServiceId> = {
  [IntegrationType.GOOGLE_GMAIL]: 'gmail',
  [IntegrationType.GOOGLE_CALENDAR]: 'calendar',
  [IntegrationType.GOOGLE_SHEETS]: 'sheets',
  [IntegrationType.GOOGLE_DRIVE]: 'drive',
};

const GOOGLE_TYPE_BY_SERVICE: Record<GoogleServiceId, IntegrationType> = {
  gmail: IntegrationType.GOOGLE_GMAIL,
  calendar: IntegrationType.GOOGLE_CALENDAR,
  sheets: IntegrationType.GOOGLE_SHEETS,
  drive: IntegrationType.GOOGLE_DRIVE,
};

export function isGoogleType(type: string): boolean {
  return type in GOOGLE_TYPE_SERVICE;
}

export function googleServiceForType(type: string): GoogleServiceId | null {
  return GOOGLE_TYPE_SERVICE[type] ?? null;
}

const IDENTITY_SCOPES = ['openid', 'email', 'profile'];
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const STATE_TTL_MS = 10 * 60 * 1000;

interface PendingAuth {
  businessId: string;
  integrationId: string | null;
  /** The dashboard address the sign-in started from; the callback sends the user back there. */
  returnTo: string;
  services: GoogleServiceId[];
  /** The callback URL sent to Google; the token exchange must repeat it exactly. */
  redirectUri: string;
  expiresAt: number;
}

export function isLoopback(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

interface GoogleConfig {
  services: GoogleServiceId[];
  accountEmail: string;
  grantedScopes: string[];
  refreshToken: string;
}

function parseServices(input: unknown): GoogleServiceId[] {
  const list = Array.isArray(input) ? input : [];
  const chosen = list.filter((s): s is GoogleServiceId => typeof s === 'string' && s in GOOGLE_SERVICES);
  const unique = [...new Set(chosen)];
  if (unique.length !== 1) throw new BadRequestException('Connect one Google service at a time');
  return unique;
}

@Injectable()
export class GoogleWorkspaceService {
  /** Sign-in attempts waiting for Google to send the user back. Short-lived, so memory is enough. */
  private readonly pending = new Map<string, PendingAuth>();
  /** Access tokens are good for about an hour; reuse them instead of refreshing on every call. */
  private readonly accessTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(@InjectRepository(Integration, 'data') private readonly repo: Repository<Integration>) {}

  private oauthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'Google sign-in is not configured: set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI',
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  /** The Google consent page URL. The state value ties the callback back to this business. */
  startAuth(
    businessId: string,
    input: { services?: unknown; integrationId?: string | null },
    returnTo = '',
    serverOrigin = '',
  ): { url: string } {
    const { clientId, redirectUri: configured } = this.oauthConfig();
    // A localhost callback copied into a production env would send Google's reply to the user's own PC
    const redirectUri =
      isLoopback(configured) && serverOrigin && !isLoopback(serverOrigin)
        ? `${serverOrigin}/api/google/oauth/callback`
        : configured;
    const services = parseServices(input.services);
    this.prune();
    const state = randomBytes(24).toString('base64url');
    this.pending.set(state, {
      businessId,
      integrationId: input.integrationId ?? null,
      returnTo,
      services,
      redirectUri,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    const scopes = [
      ...IDENTITY_SCOPES,
      ...services.flatMap(s => [GOOGLE_SERVICES[s].scope, ...(EXTRA_SCOPES[s] ?? [])]),
    ];
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      // Always ask, so Google returns a refresh token even when the account already approved the app.
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return { url: `${AUTH_ENDPOINT}?${params.toString()}` };
  }

  /** Google sent the user back with a code: trade it for tokens and save the connection. */
  async completeAuth(code: string, state: string): Promise<{ integration: Integration; returnTo: string }> {
    this.prune();
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending) throw new UnauthorizedException('This sign-in link has expired. Start the connection again.');

    const { clientId, clientSecret } = this.oauthConfig();
    const tokens = await this.post(TOKEN_ENDPOINT, {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: pending.redirectUri,
      grant_type: 'authorization_code',
    });
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. Remove the app at myaccount.google.com and try again.',
      );
    }
    const grantedScopes = String(tokens.scope ?? '')
      .split(' ')
      .filter(Boolean);
    const accountEmail = await this.accountEmail(String(tokens.access_token));

    const config: GoogleConfig = {
      services: pending.services,
      accountEmail,
      grantedScopes,
      refreshToken: encryptSecret(String(tokens.refresh_token)),
    };
    const service = pending.services[0];
    const type = GOOGLE_TYPE_BY_SERVICE[service];
    const name = `${GOOGLE_SERVICES[service].name} (${accountEmail})`;

    if (pending.integrationId) {
      const existing = await this.repo.findOne({
        where: { id: pending.integrationId, businessId: pending.businessId, type },
      });
      if (!existing) throw new NotFoundException('Google integration not found');
      existing.config = { ...(existing.config ?? {}), ...config } as unknown as Record<string, unknown>;
      existing.status = IntegrationStatus.CONNECTED;
      existing.name = name;
      this.accessTokens.delete(existing.id);
      const integration = await this.repo.save(existing);
      return { integration, returnTo: pending.returnTo };
    }
    const integration = await this.repo.save(
      this.repo.create({
        businessId: pending.businessId,
        type,
        name,
        status: IntegrationStatus.CONNECTED,
        config: config as unknown as Record<string, unknown>,
      }),
    );
    return { integration, returnTo: pending.returnTo };
  }

  /** A fresh access token for this integration, refreshed from the stored refresh token. */
  async accessToken(integration: Integration): Promise<string> {
    const cached = this.accessTokens.get(integration.id);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const config = this.readConfig(integration);
    const { clientId, clientSecret } = this.oauthConfig();
    const tokens = await this.post(TOKEN_ENDPOINT, {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptSecret(config.refreshToken),
      grant_type: 'refresh_token',
    });
    const token = String(tokens.access_token ?? '');
    if (!token) throw new UnauthorizedException('Google did not give an access token. Connect the account again.');
    const ttlMs = (Number(tokens.expires_in) || 3600) * 1000;
    this.accessTokens.set(integration.id, { token, expiresAt: Date.now() + ttlMs });
    return token;
  }

  /** Whether the Google sign-in is configured on this server, and what is missing if not. */
  status(): { configured: boolean; missing: string[] } {
    const missing = [
      ['GOOGLE_OAUTH_CLIENT_ID', process.env.GOOGLE_OAUTH_CLIENT_ID],
      ['GOOGLE_OAUTH_CLIENT_SECRET', process.env.GOOGLE_OAUTH_CLIENT_SECRET],
      ['GOOGLE_OAUTH_REDIRECT_URI', process.env.GOOGLE_OAUTH_REDIRECT_URI],
      ['GOOGLE_TOKEN_ENCRYPTION_KEY', process.env.GOOGLE_TOKEN_ENCRYPTION_KEY],
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name as string);
    return { configured: missing.length === 0, missing };
  }

  /**
   * Revokes the account's access at Google and forgets the stored token. Best effort: a token Google
   * already dropped is still removed locally, so disconnecting never gets stuck.
   */
  async revoke(integration: Integration): Promise<void> {
    const config = (integration.config ?? {}) as Partial<GoogleConfig>;
    if (config.refreshToken) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(config.refreshToken))}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(10000),
          },
        );
      } catch {
        // Google unreachable: the local token is still dropped below.
      }
    }
    this.accessTokens.delete(integration.id);
    const { refreshToken: _dropped, ...rest } = config;
    integration.config = rest as unknown as Record<string, unknown>;
  }

  /** Checks the account still works and reports which services it is connected for. */
  async verify(integration: Integration): Promise<{ success: boolean; message: string }> {
    try {
      const config = this.readConfig(integration);
      const token = await this.accessToken(integration);
      const email = await this.accountEmail(token);
      return {
        success: true,
        message: `Connected as ${email} for ${config.services.map(s => GOOGLE_SERVICES[s].label).join(', ')}`,
      };
    } catch (err) {
      return { success: false, message: `Google connection failed: ${(err as Error).message}` };
    }
  }

  async gmailSend(integration: Integration, msg: { to: string; subject: string; text: string }) {
    this.requireService(integration, 'gmail');
    const token = await this.accessToken(integration);
    const from = this.readConfig(integration).accountEmail;
    const mime = [
      `From: ${from}`,
      `To: ${msg.to}`,
      `Subject: ${msg.subject.replace(/[\r\n]+/g, ' ')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      msg.text,
    ].join('\r\n');
    const raw = Buffer.from(mime, 'utf8').toString('base64url');
    return this.api(token, 'POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw });
  }

  async calendarUpcoming(integration: Integration, max = 5) {
    this.requireService(integration, 'calendar');
    const token = await this.accessToken(integration);
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('maxResults', String(Math.min(Math.max(max, 1), 20)));
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('timeMin', new Date().toISOString());
    return this.api(token, 'GET', url.toString());
  }

  async sheetsAppend(integration: Integration, spreadsheetId: string, range: string, values: string[]) {
    this.requireService(integration, 'sheets');
    if (!/^[\w-]{10,}$/.test(spreadsheetId)) throw new BadRequestException('Enter a valid spreadsheet ID');
    const token = await this.accessToken(integration);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/` +
      `${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    return this.api(token, 'POST', url, { values: [values] });
  }

  /** Every Google Sheet in the account (not only the ones this app created), newest first. */
  async listSpreadsheets(integration: Integration) {
    this.requireService(integration, 'sheets');
    const granted = (this.readConfig(integration).grantedScopes ?? []) as string[];
    if (!granted.includes(LIST_SCOPE)) {
      throw new BadRequestException('Reconnect with Google once to allow listing your spreadsheets');
    }
    const token = await this.accessToken(integration);
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');
    const res = await this.api(token, 'GET', url.toString());
    return Array.isArray(res.files) ? (res.files as Array<Record<string, unknown>>) : [];
  }

  /**
   * The exact tab title to read. An empty name means the first tab. A name that does not exist is
   * refused with the list of real tabs, instead of Google's "Unable to parse range".
   */
  private async tabTitles(token: string, spreadsheetId: string): Promise<string[]> {
    const meta = await this.api(
      token,
      'GET',
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    );
    const titles = Array.isArray(meta.sheets)
      ? (meta.sheets as Array<{ properties?: { title?: string } }>).map(s => s.properties?.title ?? '').filter(Boolean)
      : [];
    if (titles.length === 0) throw new BadRequestException('This spreadsheet has no tabs');
    return titles;
  }

  private async resolveTab(token: string, spreadsheetId: string, requested?: string): Promise<string> {
    const titles = await this.tabTitles(token, spreadsheetId);
    const wanted = (requested ?? '').trim();
    if (!wanted) return titles[0];
    const match = titles.find(t => t.toLowerCase() === wanted.toLowerCase());
    if (!match) {
      throw new BadRequestException(`No tab named "${wanted}" in this spreadsheet. Tabs here: ${titles.join(', ')}`);
    }
    return match;
  }

  /** The column headers (row 1) and the first rows of a tab, so the user can pick the right column. */
  async sheetPreview(
    integration: Integration,
    input: { spreadsheetId: string; sheetName?: string },
  ): Promise<{ tabs: string[]; tab: string; headers: string[]; sampleRows: string[][]; suggestedKeyColumn: string }> {
    this.requireService(integration, 'sheets');
    const spreadsheetId = input.spreadsheetId.trim();
    if (!/^[\w-]{10,}$/.test(spreadsheetId)) throw new BadRequestException('Enter a valid spreadsheet ID');
    const token = await this.accessToken(integration);
    const tabs = await this.tabTitles(token, spreadsheetId);
    const range = await this.resolveTab(token, spreadsheetId, input.sheetName);
    const res = await this.api(
      token,
      'GET',
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    );
    const values = Array.isArray(res.values) ? (res.values as unknown[][]) : [];
    const headers = (values[0] ?? []).map(h => String(h ?? '').trim()).filter(Boolean);
    const sampleRows = values.slice(1, 4).map(r => (r ?? []).map(c => String(c ?? '')));
    return { tabs, tab: range, headers, sampleRows, suggestedKeyColumn: suggestKeyColumn(headers) };
  }

  /**
   * Finds the row whose key column matches the value (a phone number, or any text) and returns it.
   * Reads the whole tab once, so headers and rows always line up.
   */
  async lookupRow(
    integration: Integration,
    input: { spreadsheetId: string; sheetName?: string; keyColumn?: string; value: string },
  ): Promise<{
    found: boolean;
    rowNumber?: number;
    row?: Record<string, string>;
    fields?: Record<string, string>;
    rowText?: string;
    headers?: string[];
  }> {
    this.requireService(integration, 'sheets');
    const spreadsheetId = input.spreadsheetId.trim();
    if (!/^[\w-]{10,}$/.test(spreadsheetId)) throw new BadRequestException('Enter a valid spreadsheet ID');
    const token = await this.accessToken(integration);
    const range = await this.resolveTab(token, spreadsheetId, input.sheetName);
    const res = await this.api(
      token,
      'GET',
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    );
    const values = Array.isArray(res.values) ? (res.values as unknown[][]) : [];
    if (values.length === 0) return { found: false, headers: [] };

    const headers = values[0].map(h => String(h ?? '').trim());
    const wantedColumn = (input.keyColumn ?? '').trim().toLowerCase() || suggestKeyColumn(headers).toLowerCase();
    const keyIndex = headers.findIndex(h => h.toLowerCase() === wantedColumn);
    if (keyIndex === -1) {
      throw new BadRequestException(
        `No column called "${input.keyColumn || suggestKeyColumn(headers)}" in this tab. Columns: ${headers.filter(Boolean).join(', ')}`,
      );
    }

    for (let i = 1; i < values.length; i++) {
      const cells = values[i] ?? [];
      if (!cellMatches(cells[keyIndex], input.value)) continue;
      const row: Record<string, string> = {};
      const fields: Record<string, string> = {};
      headers.forEach((h, c) => {
        if (!h) return;
        const cell = String(cells[c] ?? '');
        row[h] = cell;
        const key = fieldKey(h);
        if (key) fields[key] = cell;
      });
      const rowText = headers
        .map((h, c) => (h ? `${h}: ${String(cells[c] ?? '')}` : ''))
        .filter(Boolean)
        .join('\n');
      return { found: true, rowNumber: i + 1, row, fields, rowText, headers };
    }
    return { found: false, headers };
  }

  /** Every data row of a tab as "Header: value" text, rows separated by a blank line. Feeds AI summaries. */
  async readAllRows(
    integration: Integration,
    input: { spreadsheetId: string; sheetName?: string },
  ): Promise<{ rowCount: number; rowsText: string; headers: string[] }> {
    this.requireService(integration, 'sheets');
    const spreadsheetId = input.spreadsheetId.trim();
    if (!/^[\w-]{10,}$/.test(spreadsheetId)) throw new BadRequestException('Enter a valid spreadsheet ID');
    const token = await this.accessToken(integration);
    const range = await this.resolveTab(token, spreadsheetId, input.sheetName);
    const res = await this.api(
      token,
      'GET',
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    );
    const values = Array.isArray(res.values) ? (res.values as unknown[][]) : [];
    if (values.length === 0) return { rowCount: 0, rowsText: '', headers: [] };
    const headers = values[0].map(h => String(h ?? '').trim());
    const rows = values
      .slice(1)
      .filter(cells => (cells ?? []).some(c => String(c ?? '').trim()))
      .map(cells =>
        headers
          .map((h, c) => (h ? `${h}: ${String(cells[c] ?? '')}` : ''))
          .filter(Boolean)
          .join('\n'),
      );
    return { rowCount: rows.length, rowsText: rows.join('\n\n'), headers };
  }

  async driveFiles(integration: Integration, pageSize = 10) {
    this.requireService(integration, 'drive');
    const token = await this.accessToken(integration);
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('pageSize', String(Math.min(Math.max(pageSize, 1), 50)));
    url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');
    return this.api(token, 'GET', url.toString());
  }

  readConfig(integration: Integration): GoogleConfig {
    const c = (integration.config ?? {}) as Partial<GoogleConfig>;
    if (!c.refreshToken || !Array.isArray(c.services)) {
      throw new BadRequestException('This Google account is not connected yet. Use "Sign in with Google" first.');
    }
    return c as GoogleConfig;
  }

  private requireService(integration: Integration, service: GoogleServiceId) {
    if (!this.readConfig(integration).services.includes(service)) {
      throw new BadRequestException(`This Google connection was not set up for ${GOOGLE_SERVICES[service].label}`);
    }
  }

  private async accountEmail(accessToken: string): Promise<string> {
    const info = await this.api(accessToken, 'GET', USERINFO_ENDPOINT);
    return String(info.email ?? 'unknown account');
  }

  private prune() {
    const now = Date.now();
    for (const [state, p] of this.pending) if (p.expiresAt < now) this.pending.delete(state);
  }

  private async post(url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok)
      throw new UnauthorizedException(String(body.error_description ?? body.error ?? `Google returned ${res.status}`));
    return body;
  }

  private async api(
    token: string,
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = (data.error as { message?: string } | undefined)?.message ?? `Google returned ${res.status}`;
      throw new BadRequestException(message);
    }
    return data;
  }
}
