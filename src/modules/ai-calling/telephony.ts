import { TwilioClient, type TwilioConfig } from './twilio.client';
import type { TelephonyProvider } from './telephony-types';

export { TelephonyApiError } from './telephony-types';
export type { TelephonyProvider } from './telephony-types';

/** The phone provider for a set of credentials, or null when none are set. Today: Twilio. */
export function telephonyFrom(config: TwilioConfig | null): TelephonyProvider | null {
  return config ? new TwilioClient(config) : null;
}
