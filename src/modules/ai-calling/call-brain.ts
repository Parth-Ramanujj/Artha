import { AiCallOutcome, AiCallSentiment, CallExtraction, TranscriptTurn } from './entities/ai-call.entity';
import { VoiceAgent } from './entities/voice-agent.entity';

export type CallLanguage = 'gu-IN' | 'hi-IN';

export const END_CALL_MARKER = '[[END_CALL]]';

/**
 * How the voice should sound for one reply, picked by the model from the customer's mood: pace is
 * multiplied by the agent's own pace, temperature is the voice engine's expressiveness.
 */
export const VOICE_TONES = {
  warm: { pace: 1, temperature: 0.6 },
  cheerful: { pace: 1.05, temperature: 0.75 },
  calm: { pace: 0.9, temperature: 0.45 },
  empathetic: { pace: 0.92, temperature: 0.5 },
  brisk: { pace: 1.1, temperature: 0.55 },
} as const;

export type VoiceTone = keyof typeof VOICE_TONES;

export function isVoiceTone(value: string): value is VoiceTone {
  return Object.prototype.hasOwnProperty.call(VOICE_TONES, value);
}

/** Voice settings for a tone, kept inside the range the voice engine accepts. */
export function voiceStyle(tone: VoiceTone, basePace: number): { pace: number; temperature: number } {
  const { pace, temperature } = VOICE_TONES[tone];
  return { pace: Math.min(2, Math.max(0.5, Math.round(basePace * pace * 100) / 100)), temperature };
}

export type AgentPersona = Pick<
  VoiceAgent,
  'personaName' | 'companyName' | 'greeting' | 'script' | 'verifiedLeadCriteria' | 'defaultLanguage'
>;

export const DEFAULT_AGENT: Omit<
  VoiceAgent,
  'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'whatsappSessionId' | 'isDefault'
> = {
  name: 'Insurance & Mutual Fund advisor',
  personaName: 'પૂજા',
  companyName: 'Artha Financial Services',
  greeting:
    'નમસ્તે {name}, હું {persona} બોલું છું {company} માંથી. તમે અમારી પાસે વીમા કે રોકાણ વિશે માહિતી માંગી હતી, તો બે મિનિટ વાત થઈ શકે?',
  script: [
    'You help families in Gujarat with insurance (health, life/term, motor) and mutual fund investments (SIP, lump sum).',
    'Goal of the call: understand what the customer needs, and if they are interested, arrange a call back from a certified advisor.',
    'Learn these, one at a time, in roughly this order, but follow the customer and pick up anything they volunteer:',
    '1. What they need: insurance or investment, and which kind (health cover for the family, term plan, car insurance, SIP...). Ask one useful follow-up about it (e.g. how many family members, or a rough budget).',
    '2. Their city or pincode, so the right local advisor can help.',
    '3. A good time for the advisor to call them back.',
    '4. Their name, only if you still do not know it, asked once near the end ("and whom should the advisor ask for?"). If they do not give it, move on.',
    'You may explain simple things (what a term plan or SIP is) in one or two sentences. Do not quote prices, premiums or returns: the advisor will share exact numbers.',
  ].join('\n'),
  verifiedLeadCriteria:
    'The customer is interested in insurance or a mutual fund, said what they need, and agreed to a call back from an advisor (a callback time or city is a bonus).',
  defaultLanguage: 'gu-IN',
  gujaratiVoice: 'pooja_gu_customer',
  hindiVoice: 'ritu_hi_customer_warm',
  pace: 1,
  model: 'openai/gpt-oss-120b',
  maxCallSeconds: 300,
  concurrency: 1,
  maxAttempts: 2,
  retryAfterMinutes: 30,
  callingStart: '09:00',
  callingEnd: '21:00',
  callingTimezone: 'Asia/Kolkata',
  whatsappFollowup: false,
  whatsappMessage:
    'નમસ્તે {name}, {company} તરફથી {persona}. આજે વાત કરવા બદલ આભાર! અમારા સલાહકાર તમને જલ્દી જ ફોન કરશે. કોઈ પ્રશ્ન હોય તો અહીં જ મેસેજ કરજો.',
};

/** Fills {name}, {persona} and {company}; an unknown name drops out cleanly instead of reading "{name}". */
export function fillTemplate(
  template: string,
  values: { name?: string | null; persona: string; company: string },
): string {
  const name = values.name?.trim() ?? '';
  return template
    .replace(/\s*\{name\}/g, name ? ` ${name}` : '')
    .replace(/\{persona\}/g, values.persona)
    .replace(/\{company\}/g, values.company)
    .replace(/\s+([,.?!।])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const LANGUAGE_NAMES: Record<CallLanguage, string> = { 'gu-IN': 'Gujarati', 'hi-IN': 'Hindi' };

export function systemPrompt(
  agent: AgentPersona,
  contactName: string | null | undefined,
  language: CallLanguage,
): string {
  const other: CallLanguage = language === 'gu-IN' ? 'hi-IN' : 'gu-IN';
  return `You are ${agent.personaName}, a friendly phone executive calling on behalf of ${agent.companyName}. This is a live PHONE CALL: everything you write is spoken aloud by a voice engine, word for word.

## What you know and what you are trying to do
${agent.script}

## The person you are calling
${contactName ? `Name on our records: ${contactName}. Confirm it naturally; never insist if they correct you.` : 'Name not known yet.'}

## Language
- Right now speak ${LANGUAGE_NAMES[language]}${language === 'gu-IN' ? ' in Gujarati script' : ' in Devanagari script'}, the everyday spoken kind, not formal or bookish.
- If the customer speaks ${LANGUAGE_NAMES[other]}, switch to ${LANGUAGE_NAMES[other]} and stay with it. Common English words people really use (insurance, policy, premium, SIP, claim, OK) are fine inside the sentence.
- Never write in Latin letters, never use emojis, lists, bullet points, brackets, markdown or special symbols. Write amounts and numbers the way they are said.

## Your tone of voice
- Begin EVERY reply with exactly one tone tag, then your words, e.g. "[[TONE:warm]] જી, સરસ.". The tag sets how the voice sounds and is never read aloud.
- Tones: warm (default, friendly); cheerful (they sound happy, excited or keen); calm (they are confused, elderly, hard of hearing, or asked you to repeat or slow down); empathetic (they are upset or worried, or mention a problem such as illness, a loss, a rejected claim or a big bill); brisk (they are busy, in a hurry, or getting irritated: keep it shortest).
- Choose from how they sound right now and change it as their mood changes during the call.

## How to sound like a real, caring person on the phone
- Write the way people actually talk on the phone, not the way they write: short phrases, commas where you would take a breath, everyday words.
- Now and then (not every reply) start with a soft natural filler such as "હમ્મ", "અચ્છા", "હા, બરાબર", "हम्म", "अच्छा जी". Never stack fillers.
- Mirror the customer's own words for things: if they say "mediclaim", say "mediclaim".
- If they interrupted you, do not restart what you were saying; answer what they said.
- Reply in ONE or TWO short sentences (about 20 words at most). Never deliver a speech.
- Ask only ONE question at a time, then stop and let them talk.
- Start with a small natural acknowledgement of what they just said ("જી", "સરસ", "અચ્છા", "बिल्कुल", "समझ गई") instead of jumping straight to the next question. Vary these; do not repeat the same one.
- Match their mood: warm and cheerful if they are friendly; calm, brief and apologetic if they sound busy, annoyed or confused. Show empathy when they mention a problem (a rejected claim, a hospital bill).
- Be respectful: use "તમે/આપ" and "जी/आप". Use their name now and then, not in every sentence.
- Always respond to what they just said before asking anything: if they share a detail (family size, city, a time), acknowledge it in a few words.
- Remember what they already told you; never ask the same thing twice. If they skip a question, do not repeat it straight away.
- Do not apologise unless you actually made a mistake or are interrupting their day.
- The speech-to-text can mishear. If a reply makes no sense, politely ask them to repeat instead of guessing.

## Handling the call
- Busy or "call later": apologise, ask for a good time, thank them and end.
- Not interested: accept it gracefully after at most one gentle, helpful reason; thank them and end.
- Wrong number: apologise for the disturbance and end.
- "Do not call me": apologise, promise they will not be called again, and end.
- Wants a human or has a complex question: say a certified advisor will call them back, confirm a time, and end.
- Answering machine, voicemail, recorded message or automated menu ("the number you are calling", "please leave a message", "कृपया संदेश छोड़ें"): do not pitch; say one short goodbye and end.

## Hard rules
- You are an AI assistant of ${agent.companyName}. Never claim to be a human. If asked whether you are a robot or AI, say honestly and warmly that you are the company's AI assistant and offer a call back from a human advisor.
- Never promise prices, premiums, returns or guarantees; never give tax or legal advice.
- Never ask for OTPs, bank, card or Aadhaar numbers, or passwords.
- When the conversation is finished, say a short warm goodbye and put ${END_CALL_MARKER} at the very end of that last message. Use it only when you are really done.
- The only bracketed text you ever write is the tone tag at the start and ${END_CALL_MARKER} at the end.`;
}

/** Spoken fillers used outside the language model (silence, errors, time limit, slow replies). */
export const STOCK_PHRASES: Record<
  CallLanguage,
  {
    stillThere: string;
    goodbyeSilent: string;
    repeat: string;
    timeUp: string;
    troubleGoodbye: string;
    thinking: readonly string[];
  }
> = {
  'gu-IN': {
    stillThere: 'હેલો, મારો અવાજ આવે છે?',
    goodbyeSilent: 'લાગે છે અત્યારે વાત નથી થઈ શકતી. હું પછી ફોન કરીશ. આભાર!',
    repeat: 'માફ કરજો, ફરીથી કહેશો?',
    timeUp: 'તમારો સમય આપવા બદલ આભાર. અમારા સલાહકાર તમને જલ્દી ફોન કરશે. આવજો!',
    troubleGoodbye: 'માફ કરજો, લાઇનમાં થોડી તકલીફ છે. અમારા સલાહકાર તમને થોડી વારમાં ફોન કરશે. આભાર!',
    thinking: ['હમ્મ...', 'જી...', 'અચ્છા...'],
  },
  'hi-IN': {
    stillThere: 'हेलो, मेरी आवाज़ आ रही है?',
    goodbyeSilent: 'लगता है अभी बात नहीं हो पा रही। मैं बाद में कॉल करूँगी। धन्यवाद!',
    repeat: 'माफ़ कीजिए, फिर से बताएँगे?',
    timeUp: 'आपका समय देने के लिए धन्यवाद। हमारे सलाहकार आपको जल्दी कॉल करेंगे। नमस्ते!',
    troubleGoodbye: 'माफ़ कीजिए, लाइन में थोड़ी दिक्कत है। हमारे सलाहकार आपको थोड़ी देर में कॉल करेंगे। धन्यवाद!',
    thinking: ['हम्म...', 'जी...', 'अच्छा...'],
  },
};

// Words a listener says while the other person talks ("yes", "hmm", "right"); not a request to stop.
const BACKCHANNEL_WORDS = new Set(
  [
    'હા હાં હં હમ હમ્મ જી ઓકે બરાબર અચ્છા સારું હાજી',
    'हाँ हां हं हम हम्म जी ओके अच्छा ठीक है सही हाँजी',
    'ok okay hmm hm mm haan ha ji yes yeah right acha achha',
  ]
    .join(' ')
    .split(' '),
);

/** True for a short "yes / hmm / ok" said while the agent is talking, which a person would talk through. */
export function isBackchannel(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.every(w => BACKCHANNEL_WORDS.has(w));
}

/**
 * Turns a token stream into speakable sentences as early as possible: a sentence is released at its
 * full stop, or at a comma once it is long, so the first words are spoken while the rest is written.
 */
export class SentenceSplitter {
  private buffer = '';

  push(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    for (;;) {
      const match = /[.!?।]+["')\]]?(\s|$)|\n/.exec(this.buffer);
      // A full stop at the very end may still be "3." of "3.5"; wait for the next token unless a space followed.
      const confirmed = match && (match.index + match[0].length < this.buffer.length || /\s$/.test(match[0]));
      let cut = match && confirmed ? match.index + match[0].length : -1;
      if (cut < 0 && this.buffer.length > 120) {
        const comma = this.buffer.lastIndexOf(',', 120);
        cut = comma > 40 ? comma + 1 : -1;
      }
      if (cut < 0) break;
      const sentence = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut);
      if (sentence) out.push(sentence);
    }
    return out;
  }

  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest || null;
  }
}

/** Removes anything a voice engine should not read: tone/end markers, markdown, emojis, brackets. */
export function speakable(text: string): string {
  return text
    .replace(/\[\[[A-Z_]+(?::[A-Za-z]+)?]]/g, '')
    .replace(/[[\]]/g, '')
    .replace(/[*_#`~>|]/g, '')
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+([,.?!।])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface CallAnalysis {
  summary: string;
  sentiment: AiCallSentiment;
  outcome: AiCallOutcome;
  isVerifiedLead: boolean;
  temperature: 'hot' | 'warm' | 'cold';
  extracted: CallExtraction;
}

export function analysisPrompt(agent: AgentPersona, transcript: TranscriptTurn[]): string {
  const lines = transcript.map(t => `${t.role === 'agent' ? 'AGENT' : 'CUSTOMER'}: ${t.text}`).join('\n');
  return `You review a phone call made by an AI agent for ${agent.companyName}.

Call goal:
${agent.script}

A call is a VERIFIED LEAD only when: ${agent.verifiedLeadCriteria}

Transcript (speech-to-text, may contain small errors):
${lines || '(the customer never spoke)'}

Reply with ONLY a JSON object, no other text:
{
  "summary": "2-3 sentences in English: who they are, what they want, what was agreed",
  "sentiment": "positive" | "neutral" | "negative",
  "outcome": "interested" | "callback" | "not_interested" | "wrong_number" | "do_not_call" | "no_conversation",
  "isVerifiedLead": true | false,
  "temperature": "hot" | "warm" | "cold",
  "extracted": {
    "name": string or null,
    "interest": "insurance" | "mutual_fund" | "claim_support" | "general" | null,
    "need": "short English description of what they want" or null,
    "pincode": "6 digits" or null,
    "city": string or null,
    "callbackTime": "when they want the call back, in English" or null,
    "notes": "anything else useful for the advisor" or null
  }
}
Use "do_not_call" only if they asked not to be called again. Use "no_conversation" if the customer said nothing meaningful. Never mark a lead verified that the transcript does not support.`;
}

const OUTCOMES = new Set<string>(Object.values(AiCallOutcome));
const SENTIMENTS = new Set(['positive', 'neutral', 'negative']);
const TEMPERATURES = new Set(['hot', 'warm', 'cold']);
const INTERESTS = new Set(['insurance', 'mutual_fund', 'claim_support', 'general']);

function str(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Reads the model's JSON defensively: anything missing or invalid falls back to a safe value. */
export function parseAnalysis(raw: string, customerSpoke: boolean): CallAnalysis {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  let data: Record<string, unknown> = {};
  if (start >= 0 && end > start) {
    try {
      data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  const x = (typeof data.extracted === 'object' && data.extracted ? data.extracted : {}) as Record<string, unknown>;
  const pincode = str(x.pincode, 10)?.replace(/\s/g, '') ?? null;
  const outcome = OUTCOMES.has(String(data.outcome))
    ? (data.outcome as AiCallOutcome)
    : customerSpoke
      ? AiCallOutcome.NOT_INTERESTED
      : AiCallOutcome.NO_CONVERSATION;
  const verified =
    data.isVerifiedLead === true &&
    customerSpoke &&
    outcome !== AiCallOutcome.DO_NOT_CALL &&
    outcome !== AiCallOutcome.WRONG_NUMBER &&
    outcome !== AiCallOutcome.NO_CONVERSATION;
  return {
    summary: str(data.summary, 1000) ?? (customerSpoke ? 'Call completed.' : 'The customer did not speak.'),
    sentiment: SENTIMENTS.has(String(data.sentiment)) ? (data.sentiment as AiCallSentiment) : 'neutral',
    outcome,
    isVerifiedLead: verified,
    temperature: TEMPERATURES.has(String(data.temperature))
      ? (data.temperature as CallAnalysis['temperature'])
      : verified
        ? 'warm'
        : 'cold',
    extracted: {
      name: str(x.name, 120),
      interest: INTERESTS.has(String(x.interest)) ? (x.interest as CallExtraction['interest']) : null,
      need: str(x.need, 300),
      pincode: pincode && /^[1-9]\d{5}$/.test(pincode) ? pincode : null,
      city: str(x.city, 80),
      callbackTime: str(x.callbackTime, 120),
      notes: str(x.notes, 500),
    },
  };
}
