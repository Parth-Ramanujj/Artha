import ExcelJS from 'exceljs';
import { fillTemplate, parseAnalysis, SentenceSplitter, speakable, systemPrompt, DEFAULT_AGENT } from './call-brain';
import { AiCallOutcome } from './entities/ai-call.entity';
import { isValidTwilioSignature, streamTwiml, twilioSignature } from './twilio.client';
import { contactsFromRows, parseContactsFile, parseCsv, toE164 } from './contacts';
import { CallTokens } from './transports';
import { withinCallingHours } from './dialer.service';

describe('call brain', () => {
  it('fills templates and drops an unknown name cleanly', () => {
    const v = { persona: 'Pooja', company: 'Artha' };
    expect(fillTemplate('નમસ્તે {name}, હું {persona} {company} માંથી.', { ...v, name: 'Ramesh' })).toBe(
      'નમસ્તે Ramesh, હું Pooja Artha માંથી.',
    );
    expect(fillTemplate('નમસ્તે {name}, હું {persona}.', { ...v, name: null })).toBe('નમસ્તે, હું Pooja.');
  });

  it('releases sentences as soon as they are complete', () => {
    const s = new SentenceSplitter();
    expect(s.push('જી, સરસ')).toEqual([]);
    expect(s.push('. તમારું નામ')).toEqual(['જી, સરસ.']);
    expect(s.push(' શું છે? હું')).toEqual(['તમારું નામ શું છે?']);
    expect(s.flush()).toBe('હું');
    expect(new SentenceSplitter().push('नमस्ते। आप कैसे हैं? ')).toEqual(['नमस्ते।', 'आप कैसे हैं?']);
  });

  it('breaks a long sentence at a comma so speech starts sooner', () => {
    const long = `${'શબ્દ '.repeat(12)}, ${'બીજો '.repeat(20)}`;
    const out = new SentenceSplitter().push(long);
    expect(out).toHaveLength(1);
    expect(out[0].endsWith(',')).toBe(true);
  });

  it('removes what a voice must not read', () => {
    expect(speakable('**જી** સરસ 😊 — ચાલો [[END_CALL]]')).toBe('જી સરસ, ચાલો');
  });

  it('keeps the honesty and safety rules in every prompt', () => {
    const prompt = systemPrompt(DEFAULT_AGENT, 'Ramesh', 'gu-IN');
    expect(prompt).toContain('Never claim to be a human');
    expect(prompt).toContain('OTPs');
    expect(prompt).toContain('Gujarati script');
    expect(systemPrompt(DEFAULT_AGENT, null, 'hi-IN')).toContain('Devanagari');
  });

  it('reads the analysis JSON even with text around it', () => {
    const raw = `Here you go: {"summary":"Wants health cover for 4.","sentiment":"positive","outcome":"interested","isVerifiedLead":true,"temperature":"hot","extracted":{"name":"Ramesh","interest":"insurance","need":"family health","pincode":"380 015","city":"Ahmedabad","callbackTime":"tomorrow 5pm"}} thanks`;
    expect(parseAnalysis(raw, true)).toMatchObject({
      outcome: 'interested',
      isVerifiedLead: true,
      temperature: 'hot',
      extracted: { name: 'Ramesh', interest: 'insurance', pincode: '380015', callbackTime: 'tomorrow 5pm' },
    });
  });

  it('never trusts a verified flag the call cannot support', () => {
    const dnc = '{"outcome":"do_not_call","isVerifiedLead":true}';
    expect(parseAnalysis(dnc, true).isVerifiedLead).toBe(false);
    expect(parseAnalysis('{"outcome":"interested","isVerifiedLead":true}', false).isVerifiedLead).toBe(false);
    expect(parseAnalysis('not json', false)).toMatchObject({
      outcome: AiCallOutcome.NO_CONVERSATION,
      isVerifiedLead: false,
    });
    expect(parseAnalysis('{"outcome":"maybe","sentiment":"angry","extracted":{"pincode":"12"}}', true)).toMatchObject({
      outcome: AiCallOutcome.NOT_INTERESTED,
      sentiment: 'neutral',
      extracted: { pincode: null },
    });
  });
});

describe('Twilio helpers', () => {
  const params = { CallSid: 'CA123', CallStatus: 'ringing', To: '+919876543210' };

  it('accepts its own signature and rejects tampering', () => {
    const url = 'https://abc.trycloudflare.com/api/ai-calling/twilio/status';
    const sig = twilioSignature('token', url, params);
    expect(isValidTwilioSignature('token', url, params, sig)).toBe(true);
    expect(isValidTwilioSignature('token', url, { ...params, CallStatus: 'completed' }, sig)).toBe(false);
    expect(isValidTwilioSignature('other', url, params, sig)).toBe(false);
    expect(isValidTwilioSignature('token', url, params, undefined)).toBe(false);
  });

  it('matches the documented algorithm (URL + params sorted by name)', () => {
    // Order of the object must not matter.
    const a = twilioSignature('t', 'https://x/y', { b: '2', a: '1' });
    const b = twilioSignature('t', 'https://x/y', { a: '1', b: '2' });
    expect(a).toBe(b);
  });

  it('escapes the stream URL and parameters in TwiML', () => {
    const xml = streamTwiml('wss://h/api/ai-calling/stream', { token: 'a"b<c' });
    expect(xml).toContain('<Connect><Stream url="wss://h/api/ai-calling/stream">');
    expect(xml).toContain('value="a&quot;b&lt;c"');
  });
});

describe('call tokens', () => {
  it('verifies its own tokens only, and only until they expire', () => {
    const tokens = new CallTokens();
    const token = tokens.issue('call-1');
    expect(tokens.verify(token)).toBe('call-1');
    expect(new CallTokens().verify(token)).toBeNull();
    expect(tokens.verify(token.replace('call-1', 'call-2'))).toBeNull();
    expect(tokens.verify(tokens.issue('call-1', -1))).toBeNull();
    expect(tokens.verify(undefined)).toBeNull();
  });
});

describe('calling hours', () => {
  const agent = { callingStart: '09:00', callingEnd: '21:00', callingTimezone: 'Asia/Kolkata' };
  it('uses the local time of the agent', () => {
    expect(withinCallingHours(agent, new Date('2026-10-19T04:00:00Z'))).toBe(true); // 09:30 IST
    expect(withinCallingHours(agent, new Date('2026-10-19T03:00:00Z'))).toBe(false); // 08:30 IST
    expect(withinCallingHours(agent, new Date('2026-10-19T15:45:00Z'))).toBe(false); // 21:15 IST
  });
});

describe('contact lists', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['9876543210.0', '+919876543210'],
    ['12345', null],
    ['', null],
  ])('%j → %j', (raw, expected) => {
    expect(toE164(raw)).toBe(expected);
  });

  it('parses CSV with quotes, semicolons and a Gujarati header', () => {
    expect(parseCsv('a,"b, c","d ""q"""\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "q"'],
      ['1', '2', '3'],
    ]);
    const parsed = contactsFromRows(parseCsv('નામ;મોબાઇલ\nરમેશ;98765 43210\nસીમા;9876543210\nખોટો;123'));
    expect(parsed).toEqual({ contacts: [{ phone: '+919876543210', name: 'રમેશ' }], invalid: 1, duplicates: 1 });
  });

  it('finds the phone column when the sheet has no header', () => {
    const parsed = contactsFromRows([
      ['Ramesh', 'Ahmedabad', '9876543210'],
      ['Sima', 'Surat', '9123456789'],
    ]);
    expect(parsed.contacts).toEqual([
      { phone: '+919876543210', name: 'Ramesh' },
      { phone: '+919123456789', name: 'Sima' },
    ]);
  });

  it('reads an Excel workbook', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Leads');
    sheet.addRow(['Name', 'Mobile No', 'City']);
    sheet.addRow(['Ramesh', 9876543210, 'Ahmedabad']);
    sheet.addRow(['Sima', '+91 91234 56789', 'Surat']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseContactsFile('leads.xlsx', buffer);
    expect(parsed.contacts).toEqual([
      { phone: '+919876543210', name: 'Ramesh' },
      { phone: '+919123456789', name: 'Sima' },
    ]);
    await expect(parseContactsFile('leads.pdf', buffer)).rejects.toThrow(/xlsx or \.csv/);
  });
});
