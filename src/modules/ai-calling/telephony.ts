import { TwilioClient, twilioConfigFromEnv } from './twilio.client';
import type { TelephonyProvider } from './telephony-types';

export { TelephonyApiError } from './telephony-types';
export type { TelephonyProvider } from './telephony-types';

/** The configured phone provider, or null when none is set up. Today: Twilio. */
export function telephonyFromEnv(env: NodeJS.ProcessEnv = process.env): TelephonyProvider | null {
  const twilio = twilioConfigFromEnv(env);
  return twilio ? new TwilioClient(twilio) : null;
}
