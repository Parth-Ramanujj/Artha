import {
  autopilotHoldReason,
  inQuietHours,
  isEscalation,
  isOptOut,
  nextStage,
  normalizePhone,
  parseIntent,
  parseJson,
  preSendProblems,
  stripQuotedReply,
} from './sales-rules';
import { inIndia, readSignals } from './discovery.service';
import { buildOverpassQuery, explicitSplit, parseBusiness } from './search-query';

describe('sales rules', () => {
  it('detects opt-outs in English, Hindi and Gujarati, but not ordinary replies', () => {
    for (const t of ['STOP', 'please remove me from this list', 'No thanks', 'मत भेजो', 'બંધ કરો', 'not interested']) {
      expect(isOptOut(t)).toBe(true);
    }
    for (const t of ['Sounds good, what does it cost?', 'Can you call me tomorrow?', '']) {
      expect(isOptOut(t)).toBe(false);
    }
  });

  it('flags legal threats for a person', () => {
    expect(isEscalation('I will talk to my lawyer')).toBe(true);
    expect(isEscalation('Tell me more about pricing')).toBe(false);
  });

  it('parses the model label leniently and treats silence as escalate', () => {
    expect(parseIntent('interested')).toBe('interested');
    expect(parseIntent('Label: not_interested.')).toBe('not_interested');
    expect(parseIntent('hmm')).toBe('question');
    expect(parseIntent('')).toBe('escalate');
  });

  it('moves the stage forward on interest and closes on refusal', () => {
    expect(nextStage('initial_outreach', 'interested', 'tell me more')).toBe('engaged');
    expect(nextStage('engaged', 'interested', 'can we schedule a call?')).toBe('closing');
    expect(nextStage('engaged', 'not_interested', '')).toBe('closed_lost');
  });

  it('pulls JSON out of chatty model output', () => {
    expect(parseJson<{ a: number }>('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('no json here')).toBeNull();
  });

  it('blocks unsafe or broken messages before sending', () => {
    expect(preSendProblems('whatsapp', 'sequence', { subject: '', body: 'Hi Asha, quick question?' })).toEqual([]);
    expect(preSendProblems('whatsapp', 'sequence', { subject: '', body: 'Hi {{first_name}}' })).toContain(
      'unfilled merge tag',
    );
    expect(preSendProblems('whatsapp', 'sequence', { subject: '', body: 'See https://x.test' })).toContain(
      'links in cold WhatsApp',
    );
    expect(preSendProblems('email', 'sequence', { subject: '', body: 'Hello' })).toContain('empty subject');
  });

  it('holds autopilot messages that point outside the allowed hosts', () => {
    expect(autopilotHoldReason('Book here: https://cal.example.com/me', ['https://cal.example.com/me'])).toBeNull();
    expect(autopilotHoldReason('Pay at https://evil.test/x', ['example.com'])).toBe('links to evil.test');
    expect(autopilotHoldReason('write to boss@evil[.]test', ['example.com'])).toMatch(/boss@evil\.test/);
  });

  it('honours quiet hours across midnight in the configured timezone', () => {
    const schedule = { heartbeatMinutes: 15, quietStart: '21:00', quietEnd: '09:00', timezone: 'Asia/Kolkata' };
    expect(inQuietHours(schedule, new Date('2026-10-24T17:00:00Z'))).toBe(true); // 22:30 IST
    expect(inQuietHours(schedule, new Date('2026-10-24T06:00:00Z'))).toBe(false); // 11:30 IST
  });

  it('turns listed phones into international digits', () => {
    expect(normalizePhone('+91 98765 43210', '1')).toBe('919876543210');
    expect(normalizePhone('098765 43210', '91')).toBe('919876543210');
    expect(normalizePhone('0044 20 7946 0958', '91')).toBe('442079460958');
  });

  it('drops quoted history from email replies', () => {
    expect(stripQuotedReply('Yes please\n\nOn Mon, Bob wrote:\n> old text')).toBe('Yes please');
  });
});

describe('discovery helpers', () => {
  it('understands the business part with typos and filler words', () => {
    const q = parseBusiness('insurence agent');
    expect(q.category?.label).toBe('insurance');
    expect(q.nameWords).toEqual(expect.arrayContaining(['insurance', 'lic']));
    expect(parseBusiness('best dentist near').category?.label).toBe('dentist');
    expect(parseBusiness('CA office').category?.label).toBe('accountant / CA');
    // Unknown kinds of business still search by name.
    const tiles = parseBusiness('ceramic tiles showroom');
    expect(tiles.nameWords).toEqual(expect.arrayContaining(['ceramic', 'showroom']));
  });

  it('splits "X in Y" and "X, Y" at the place marker', () => {
    expect(explicitSplit('dentist in South Bopal')).toEqual({ what: 'dentist', where: 'South Bopal' });
    expect(explicitSplit('gym, vadodara')).toEqual({ what: 'gym', where: 'vadodara' });
    expect(explicitSplit('insurance agent ahmedabad')).toBeNull();
  });

  it('builds an Overpass query from tags and whole-word name matches', () => {
    const known = buildOverpassQuery(parseBusiness('insurance'), 23, 72.5, 5000, 10);
    expect(known).toBe('[out:json][timeout:60];(nwr["office"="insurance"](around:5000,23,72.5););out center 10;');
    const unknown = buildOverpassQuery(parseBusiness('ceramic showroom'), 23, 72.5, 5000, 10);
    expect(unknown).toContain('nwr["name"~"(^|[^a-z])(ceramic|showroom)([^a-z]|$)",i]');
  });

  it('keeps the search inside India', () => {
    expect(inIndia(23.02, 72.57)).toBe(true); // Ahmedabad
    expect(inIndia(40.71, -74.0)).toBe(false); // New York
  });

  it('reads free signals and on-domain contacts from a homepage', () => {
    const html = `<script src="https://www.googleadservices.com/x.js"></script>
      <link href="/wp-content/a.css"><a href="mailto:info@clinic.test">mail</a>
      <a href="mailto:someone@gmail.com">x</a><a href="tel:+91 98765 43210">call</a>`;
    const read = readSignals(html, 'clinic.test', '91');
    expect(read.email).toBe('info@clinic.test');
    expect(read.phone).toBe('919876543210');
    expect(read.signals.map(s => s.code)).toEqual(
      expect.arrayContaining(['RUNNING_GOOGLE_ADS', 'NO_ONLINE_BOOKING', 'TECH_STACK']),
    );
  });
});
