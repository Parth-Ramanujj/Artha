import type { WhatsAppLogEvent } from '../services/api';

export type JourneyStage = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'refused';

/** One outgoing message, from our send to Meta's last report about it. */
export interface MessageJourney {
  waMessageId: string;
  phone: string | null;
  /** "greeting" for a template, or the message type. */
  title: string;
  stage: JourneyStage;
  startedAt: string;
  at: Partial<Record<'accepted' | 'sent' | 'delivered' | 'read' | 'failed', string>>;
  category: string | null;
  billable: boolean | null;
  failure?: { code: string | null; reason: string; why?: string; fix?: string };
  events: WhatsAppLogEvent[];
}

const RANK: Record<JourneyStage, number> = { refused: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5 };

const titleOf = (e: WhatsAppLogEvent): string | null => {
  const request = (e.details?.request ?? {}) as { type?: string; template?: { name?: string } };
  if (request.type === 'template' && request.template?.name) return request.template.name;
  const quoted = /template “([^”]+)”/.exec(e.summary)?.[1];
  return quoted ?? request.type ?? null;
};

/**
 * Splits the log into per-message journeys (our sends and Meta's status reports, matched by message
 * id) and everything else (incoming messages, account and template events, fixes). Newest first.
 */
export function buildJourneys(events: WhatsAppLogEvent[]): {
  journeys: MessageJourney[];
  activity: WhatsAppLogEvent[];
} {
  const byId = new Map<string, MessageJourney>();
  const activity: WhatsAppLogEvent[] = [];
  // Oldest first, so a later report always wins over an earlier one.
  for (const e of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const isMessageStep = e.kind.startsWith('send.') || e.kind.startsWith('status.');
    if (!isMessageStep || !e.waMessageId) {
      if (e.kind === 'send.rejected') {
        // A refused send has no message id; show it as its own (failed) journey.
        byId.set(`refused:${e.id}`, {
          waMessageId: `refused:${e.id}`,
          phone: e.phone,
          title: titleOf(e) ?? 'message',
          stage: 'refused',
          startedAt: e.createdAt,
          at: {},
          category: null,
          billable: null,
          failure: { code: null, reason: e.summary.replace(/^Meta refused the [^:]+: /, '') },
          events: [e],
        });
      } else {
        activity.push(e);
      }
      continue;
    }
    const j =
      byId.get(e.waMessageId) ??
      ({
        waMessageId: e.waMessageId,
        phone: e.phone,
        title: 'message',
        stage: 'accepted',
        startedAt: e.createdAt,
        at: {},
        category: null,
        billable: null,
        events: [],
      } as MessageJourney);
    j.events.push(e);
    j.phone ??= e.phone;
    const title = e.kind === 'send.accepted' ? titleOf(e) : null;
    if (title) j.title = title;

    const stage: JourneyStage | null =
      e.kind === 'send.accepted' ? 'accepted' : (e.kind.replace('status.', '') as JourneyStage);
    if (stage && stage in RANK && stage !== 'refused') {
      j.at[stage as keyof MessageJourney['at']] ??= e.createdAt;
      if (RANK[stage] > RANK[j.stage]) j.stage = stage;
    }
    const pricing = e.details?.pricing as { category?: string; billable?: boolean } | undefined;
    if (pricing?.category) j.category = pricing.category;
    if (typeof pricing?.billable === 'boolean') j.billable = pricing.billable;
    if (e.kind === 'status.failed') {
      const err = (e.details?.errors as Array<{ code?: number | string }> | undefined)?.[0];
      const explanation = e.details?.explanation as { why?: string; fix?: string } | undefined;
      j.failure = {
        code: err?.code !== undefined ? String(err.code) : null,
        reason: e.summary.replace(/^Failed for [^:]+: /, ''),
        why: explanation?.why,
        fix: explanation?.fix,
      };
    }
    byId.set(e.waMessageId, j);
  }
  const journeys = [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return { journeys, activity: activity.reverse() };
}

/** "12 s", "3 min", "2 h" between two ISO times. */
export function took(from: string, to: string | undefined): string | null {
  if (!to) return null;
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
}

/** Counts for the summary bar. */
export function journeyStats(journeys: MessageJourney[]) {
  const count = (stages: JourneyStage[]) => journeys.filter(j => stages.includes(j.stage)).length;
  const total = journeys.length;
  const reached = count(['delivered', 'read']);
  return {
    total,
    delivered: reached,
    read: count(['read']),
    failed: count(['failed', 'refused']),
    pending: count(['accepted', 'sent']),
    deliveryRate: total ? Math.round((reached / total) * 100) : null,
  };
}
