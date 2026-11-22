/** What the dialer needs from a phone provider. Twilio implements it; another provider can too. */
export interface TelephonyProvider {
  readonly name: string;
  createCall(input: {
    to: string;
    twimlUrl: string;
    statusCallback?: string;
  }): Promise<{ sid: string; status: string }>;
  getCall(callSid: string): Promise<{ status: string; duration: string | null }>;
  hangup(callSid: string): Promise<void>;
}

/** A provider refused or failed a request. `status` is the HTTP status (0 when it never answered). */
export class TelephonyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
  }
}
