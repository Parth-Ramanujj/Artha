import { canAutoPublish, fillTemplate, fromGoogleReview, replyProblems, shouldAlert } from './gbp-rules';

describe('gbp-rules', () => {
  it('maps a Google review, keeping the original text of a translated one', () => {
    const r = fromGoogleReview({
      name: 'accounts/1/locations/2/reviews/abc',
      reviewer: { displayName: 'Asha Patel' },
      starRating: 'FOUR',
      comment: '(Original)\nસરસ સેવા\n\n(Translated by Google)\nGood service',
      createTime: '2026-10-01T10:00:00Z',
      updateTime: '2026-10-01T10:00:00Z',
      reviewReply: { comment: 'Thanks!', updateTime: '2026-10-02T10:00:00Z' },
    });
    expect(r.stars).toBe(4);
    expect(r.comment).toBe('સરસ સેવા');
    expect(r.reply?.comment).toBe('Thanks!');
    expect(fromGoogleReview({ reviewer: { isAnonymous: true }, starRating: 'X' })).toMatchObject({
      reviewerName: 'A Google user',
      stars: 0,
      reply: null,
    });
  });

  it('auto-publishes only at or above the star threshold', () => {
    const cfg = { autoPublishMinStars: 4, autoPublishRequiresText: true };
    expect(canAutoPublish(cfg, { stars: 5, comment: 'great' })).toBe(true);
    expect(canAutoPublish(cfg, { stars: 5, comment: '' })).toBe(false);
    expect(canAutoPublish(cfg, { stars: 3, comment: 'ok' })).toBe(false);
    expect(canAutoPublish({ ...cfg, autoPublishMinStars: 0 }, { stars: 5, comment: 'x' })).toBe(false);
  });

  it('alerts once for low ratings when a WhatsApp target is set', () => {
    const cfg = { alertMaxStars: 3, alertSessionId: 's1', alertPhone: '919999999999' };
    expect(shouldAlert(cfg, { stars: 2, alertedAt: null })).toBe(true);
    expect(shouldAlert(cfg, { stars: 2, alertedAt: new Date() })).toBe(false);
    expect(shouldAlert(cfg, { stars: 4, alertedAt: null })).toBe(false);
    expect(shouldAlert({ ...cfg, alertPhone: '' }, { stars: 1, alertedAt: null })).toBe(false);
  });

  it('refuses empty, overlong and incentive replies', () => {
    expect(replyProblems('Thank you!')).toEqual([]);
    expect(replyProblems('  ')).toHaveLength(1);
    expect(replyProblems('x'.repeat(5000))).toHaveLength(1);
    expect(replyProblems('Here is a 10% discount for you')).toHaveLength(1);
  });

  it('fills the review request and always includes the link', () => {
    expect(fillTemplate('Hi {name}, review us: {link}', { name: 'Ravi', link: 'https://g.page/r/x' })).toBe(
      'Hi Ravi, review us: https://g.page/r/x',
    );
    expect(fillTemplate('Thanks {name}', { name: '', link: 'L' })).toBe('Thanks there\nL');
  });
});
