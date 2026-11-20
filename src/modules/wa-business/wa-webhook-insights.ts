/**
 * Reads the parts of a Meta webhook that the business tools care about: Click-to-WhatsApp ad
 * referrals, WhatsApp calls, and warnings about template / number quality. Pure, so it is tested
 * without a server.
 */

export interface AdReferralInfo {
  phoneNumberId?: string;
  phone: string;
  customerName: string | null;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  firstMessage: string | null;
  ctwaClid: string | null;
}

export interface CallInfo {
  phoneNumberId?: string;
  callId: string;
  phone: string;
  direction: string;
  status: 'ringing' | 'completed' | 'missed' | 'failed';
  durationSec: number;
}

export interface QualityAlert {
  /** true = something stops or may stop sending; false = worth knowing. */
  severe: boolean;
  title: string;
  message: string;
}

export interface WebhookInsights {
  referrals: AdReferralInfo[];
  calls: CallInfo[];
  alerts: QualityAlert[];
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const arr = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);
const cut = (v: unknown, n: number) => str(v).slice(0, n) || null;

function templateAlert(v: Obj): QualityAlert | null {
  const event = str(v.event).toUpperCase();
  const name = str(v.message_template_name) || 'a template';
  const reason = str(v.reason) && str(v.reason) !== 'NONE' ? ` Reason: ${str(v.reason)}.` : '';
  if (event === 'PAUSED')
    return {
      severe: true,
      title: `Template “${name}” was paused by Meta`,
      message: `Too many people blocked or reported it, so Meta paused it and campaigns using it will fail.${reason} Change the text (less promotional, clear opt-out) and send it only to people who expect it.`,
    };
  if (event === 'DISABLED')
    return {
      severe: true,
      title: `Template “${name}” was disabled by Meta`,
      message: `It was paused repeatedly and can no longer be sent.${reason} Create a new, improved template instead.`,
    };
  if (event === 'FLAGGED')
    return {
      severe: true,
      title: `Template “${name}” is flagged (low quality)`,
      message: `If its quality does not improve in 7 days Meta will disable it.${reason} Pause campaigns that use it.`,
    };
  if (event === 'REJECTED')
    return {
      severe: false,
      title: `Template “${name}” was rejected`,
      message: `Meta did not approve it.${reason} Edit it in WhatsApp Templates and submit again.`,
    };
  return null;
}

function qualityAlert(v: Obj): QualityAlert | null {
  const score = str(v.new_quality_score).toUpperCase();
  const name = str(v.message_template_name) || 'a template';
  if (score === 'RED')
    return {
      severe: true,
      title: `Template “${name}” quality dropped to LOW (red)`,
      message: `Many people block or report it. Stop sending it now, or Meta will pause it and your number's rating will suffer.`,
    };
  if (score === 'YELLOW')
    return {
      severe: false,
      title: `Template “${name}” quality dropped to MEDIUM (yellow)`,
      message:
        'Some people block or report it. Send it to fewer, more interested people and make the text more useful.',
    };
  return null;
}

function numberAlert(v: Obj): QualityAlert | null {
  const event = str(v.event).toUpperCase();
  const phone = str(v.display_phone_number) || 'your number';
  const limit = str(v.current_limit);
  if (event === 'FLAGGED')
    return {
      severe: true,
      title: `${phone} is flagged for low quality`,
      message:
        'Meta saw many blocks or reports. Send fewer marketing messages for the next 7 days, or the number’s daily limit will be lowered.',
    };
  if (event === 'DOWNGRADE')
    return {
      severe: true,
      title: `${phone}: daily messaging limit lowered${limit ? ` to ${limit}` : ''}`,
      message: 'Quality stayed low, so Meta lowered how many people you can message per day.',
    };
  return null;
}

function accountAlert(v: Obj): QualityAlert | null {
  const event = str(v.event).toUpperCase();
  if (!/VIOLATION|RESTRICT|DISABLE|BAN/.test(event)) return null;
  const info = (v.violation_info ?? v.restriction_info ?? v.ban_info) as Obj | Obj[] | undefined;
  const detail = Array.isArray(info) ? str(info[0]?.restriction_type) : str(info?.violation_type);
  return {
    severe: true,
    title: `Meta: WhatsApp account ${event.toLowerCase().replace(/_/g, ' ')}`,
    message: `${detail ? `${detail}. ` : ''}Open WhatsApp Manager → Account quality to see the details and appeal if it is a mistake.`,
  };
}

export function readWebhookInsights(body: Obj): WebhookInsights {
  const out: WebhookInsights = { referrals: [], calls: [], alerts: [] };
  for (const entry of arr(body.entry)) {
    for (const change of arr(entry.changes)) {
      const field = str(change.field);
      const v = (change.value ?? {}) as Obj;
      const phoneNumberId = str((v.metadata as Obj | undefined)?.phone_number_id) || undefined;
      const nameOf = (waId: string) =>
        cut((arr(v.contacts).find(c => str(c.wa_id) === waId)?.profile as Obj | undefined)?.name, 128);

      if (field === 'messages') {
        for (const m of arr(v.messages)) {
          const r = m.referral as Obj | undefined;
          if (!r) continue;
          out.referrals.push({
            phoneNumberId,
            phone: str(m.from),
            customerName: nameOf(str(m.from)),
            sourceType: str(r.source_type) || 'unknown',
            sourceId: cut(r.source_id, 64),
            sourceUrl: cut(r.source_url, 500),
            headline: cut(r.headline, 300),
            firstMessage: cut((m.text as Obj | undefined)?.body, 300),
            ctwaClid: cut(r.ctwa_clid, 256),
          });
        }
      } else if (field === 'calls') {
        for (const c of arr(v.calls)) {
          const direction = str(c.direction) || 'USER_INITIATED';
          const event = str(c.event);
          const duration = Number(c.duration) || 0;
          const done = str(c.status).toUpperCase() === 'COMPLETED' && duration > 0;
          const status: CallInfo['status'] =
            event === 'connect' ? 'ringing' : done ? 'completed' : direction === 'USER_INITIATED' ? 'missed' : 'failed';
          out.calls.push({
            phoneNumberId,
            callId: str(c.id),
            phone: direction === 'USER_INITIATED' ? str(c.from) : str(c.to),
            direction,
            status,
            durationSec: duration,
          });
        }
      } else {
        const alert =
          field === 'message_template_status_update'
            ? templateAlert(v)
            : field === 'message_template_quality_update'
              ? qualityAlert(v)
              : field === 'phone_number_quality_update'
                ? numberAlert(v)
                : field === 'account_update'
                  ? accountAlert(v)
                  : null;
        if (alert) out.alerts.push(alert);
      }
    }
  }
  out.calls = out.calls.filter(c => c.callId && c.phone);
  out.referrals = out.referrals.filter(r => r.phone);
  return out;
}
