import {
  cleanPhone,
  fillName,
  formatSummaryFallback,
  healthScore,
  localDay,
  localDayBounds,
  parseIntent,
  parseRef,
  waLink,
} from './growth-rules';

describe('growth rules', () => {
  it('reads the local day in the business timezone', () => {
    // 20:00 UTC on Oct 31 is already Nov 1 in India.
    expect(localDay('Asia/Kolkata', new Date('2026-10-31T20:00:00Z'))).toEqual({
      date: '2026-11-01',
      monthDay: '11-01',
    });
    const { start, end } = localDayBounds('Asia/Kolkata', new Date('2026-10-31T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-01T18:30:00.000Z');
  });

  it('round-trips the tracking ref through the wa.me link', () => {
    const url = waLink('919876543210', 'Hi, I saw your poster', 'ab12cd34');
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(parseRef(decodeURIComponent(url.split('text=')[1]))).toBe('ab12cd34');
    expect(parseRef('hello')).toBeNull();
  });

  it('cleans phones and fills names', () => {
    expect(cleanPhone('+91 98765-43210')).toBe('919876543210');
    expect(cleanPhone('123')).toBeNull();
    expect(fillName('Happy birthday {name}!', 'Asha')).toBe('Happy birthday Asha!');
    expect(fillName('Hi {Name}', null)).toBe('Hi there');
  });

  it('scores sender health from failures, opt-outs and bursts', () => {
    expect(healthScore({ sent: 1000, failed: 5, optIns: 300, optOuts: 2, peakPerHour: 80 })).toEqual({
      score: 100,
      level: 'good',
      warnings: [],
    });
    const bad = healthScore({ sent: 1000, failed: 150, optIns: 0, optOuts: 40, peakPerHour: 900 });
    expect(bad.level).toBe('risk');
    expect(bad.warnings).toHaveLength(4);
    expect(healthScore({ sent: 0, failed: 0, optIns: 0, optOuts: 0, peakPerHour: 0 }).score).toBe(100);
  });

  it('formats the fallback summary', () => {
    const text = formatSummaryFallback({
      date: '2026-10-31',
      newLeads: 23,
      dealsWon: 5,
      wonAmount: 125000,
      complaints: 3,
      messagesIn: 140,
      messagesOut: 210,
      followUps: [{ name: 'Ravi', reason: 'hot lead, no reply' }],
    });
    expect(text).toContain('New leads: 23');
    expect(text).toContain('₹1,25,000');
    expect(text).toContain('1. Ravi – hot lead, no reply');
  });

  it('parses the intent JSON defensively', () => {
    expect(parseIntent('Sure: {"intent":"complaint"}')).toBe('complaint');
    expect(parseIntent('{"intent":"refund"}')).toBe('other');
    expect(parseIntent('not json')).toBe('other');
  });
});
