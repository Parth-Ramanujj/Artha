import type { GbpConfig, GbpReview } from './entities/google-business.entity';

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** Google caps a review reply at 4096 bytes. */
export const MAX_REPLY_CHARS = 4000;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const date = (v: unknown) => {
  const d = typeof v === 'string' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Google's v4 review JSON → the fields we keep. */
export function fromGoogleReview(
  raw: Record<string, unknown>,
): Pick<
  GbpReview,
  'reviewName' | 'reviewerName' | 'reviewerPhoto' | 'stars' | 'comment' | 'reviewedAt' | 'reviewUpdatedAt'
> & { reply: { comment: string; updatedAt: Date | null } | null } {
  const reviewer = (raw.reviewer ?? {}) as { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  const reply = raw.reviewReply as { comment?: string; updateTime?: string } | undefined;
  // Google appends "(Translated by Google)" plus the translation; the owner answers the original.
  const comment = str(raw.comment)
    .split('\n\n(Translated by Google)')[0]
    .replace(/^\(Original\)\n/, '');
  return {
    reviewName: str(raw.name),
    reviewerName: reviewer.isAnonymous ? 'A Google user' : str(reviewer.displayName).slice(0, 200),
    reviewerPhoto: str(reviewer.profilePhotoUrl).slice(0, 500),
    stars: STARS[str(raw.starRating)] ?? 0,
    comment: comment.trim(),
    reviewedAt: date(raw.createTime),
    reviewUpdatedAt: date(raw.updateTime),
    reply: reply?.comment ? { comment: reply.comment, updatedAt: date(reply.updateTime) } : null,
  };
}

/** Whether a fresh draft for this review may go live without a person approving it. */
export function canAutoPublish(
  config: Pick<GbpConfig, 'autoPublishMinStars' | 'autoPublishRequiresText'>,
  review: Pick<GbpReview, 'stars' | 'comment'>,
): boolean {
  if (!config.autoPublishMinStars || review.stars < config.autoPublishMinStars) return false;
  return !config.autoPublishRequiresText || !!review.comment.trim();
}

export function shouldAlert(
  config: Pick<GbpConfig, 'alertMaxStars' | 'alertSessionId' | 'alertPhone'>,
  review: Pick<GbpReview, 'stars' | 'alertedAt'>,
): boolean {
  return (
    !!config.alertMaxStars &&
    !!config.alertSessionId &&
    !!config.alertPhone &&
    review.stars > 0 &&
    review.stars <= config.alertMaxStars &&
    !review.alertedAt
  );
}

/** Problems that keep a reply from being published. Empty = fine. */
export function replyProblems(text: string): string[] {
  const t = text.trim();
  const problems: string[] = [];
  if (!t) problems.push('The reply is empty');
  if (t.length > MAX_REPLY_CHARS) problems.push(`The reply is longer than ${MAX_REPLY_CHARS} characters`);
  // Google removes replies that offer rewards for reviews.
  if (/\b(discount|coupon|voucher|cashback|free gift)\b/i.test(t)) problems.push('Replies must not offer rewards');
  return problems;
}

/** Fills {name} and {link} in the review request message. */
export function fillTemplate(template: string, values: { name: string; link: string }): string {
  const text = template.replace(/\{name\}/g, values.name || 'there').replace(/\{link\}/g, values.link);
  return text.includes(values.link) ? text : `${text}\n${values.link}`;
}

export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

export const DEFAULT_REVIEW_REQUEST =
  'Hi {name}, thank you for choosing us! If you have a minute, a short Google review would help us a lot: {link}';
