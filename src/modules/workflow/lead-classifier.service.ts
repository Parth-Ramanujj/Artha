import { Injectable, Optional } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { createLogger } from '../../common/services/logger.service';
import { LeadClassifiedBy, LeadInterest, LeadTemperature } from './entities/lead.entity';

export interface LeadClassification {
  temperature: LeadTemperature;
  interest: LeadInterest;
  classifiedBy: LeadClassifiedBy.AI | LeadClassifiedBy.RULES;
  reason: string;
}

const AI_MODEL = 'openai/gpt-oss-20b';
const MAX_MESSAGE_CHARS = 1000;

// Matched against lower-cased text, so English, romanized Hindi/Gujarati and native script all work.
const INTEREST_KEYWORDS: [LeadInterest, string[]][] = [
  [
    LeadInterest.CLAIM_SUPPORT,
    ['claim', 'cashless', 'settlement', 'reimburse', 'rejected', 'reject', 'क्लेम', 'ક્લેમ', 'દાવો'],
  ],
  [
    LeadInterest.MUTUAL_FUND,
    [
      'mutual fund',
      'mutualfund',
      'sip',
      'lumpsum',
      'lump sum',
      'elss',
      'invest',
      'nivesh',
      'म्यूचुअल',
      'निवेश',
      'મ્યુચ્યુઅલ',
      'રોકાણ',
      'એસઆઈપી',
    ],
  ],
  [
    LeadInterest.INSURANCE,
    [
      'insurance',
      'insure',
      'policy',
      'premium',
      'mediclaim',
      'term plan',
      'health cover',
      'life cover',
      'bima',
      'vimo',
      'renew',
      'बीमा',
      'पॉलिसी',
      'વીમો',
      'વીમા',
      'પોલિસી',
    ],
  ],
];

const HOT_KEYWORDS = [
  'buy',
  'purchase',
  'want to take',
  'want to start',
  'interested',
  'apply',
  'quote',
  'price',
  'cost',
  'how much',
  'call me',
  'call karo',
  'urgent',
  'asap',
  'today',
  'right now',
  'kharid',
  'levu',
  'levo',
  'levi',
  'leni',
  'lena',
  'chahiye',
  'joie che',
  'joiye',
  'ketla',
  'kitna',
  'jaldi',
  'aaje',
  'aaj hi',
  'खरीद',
  'चाहिए',
  'कितना',
  'जल्दी',
  'आज',
  'ખરીદ',
  'જોઈએ',
  'કેટલા',
  'જલ્દી',
  'આજે',
];

const WARM_KEYWORDS = [
  'info',
  'details',
  'detail',
  'tell me',
  'explain',
  'compare',
  'plan',
  'option',
  'which',
  'what',
  'how',
  'jankari',
  'mahiti',
  'batao',
  'samjao',
  'shu che',
  'kya hai',
  'जानकारी',
  'बताओ',
  'क्या',
  'માહિતી',
  'જણાવો',
  'શું',
];

const GREETING_ONLY =
  /^(hi+|hey+|hello+|helo|hlo|hii+|namaste|namaskar|jai shree krishna|jay shree krishna|kem cho|good (morning|afternoon|evening)|नमस्ते|નમસ્તે|કેમ છો|ok|okay|thanks|thank you|[\s\p{P}\p{S}\p{Emoji_Presentation}])*$/iu;

const hasAny = (text: string, words: string[]) => words.some(w => new RegExp(`(^|[^\\p{L}])${w}`, 'u').test(text));

export function classifyByRules(message: string): LeadClassification {
  const text = (message || '').toLowerCase().trim();
  if (!text || GREETING_ONLY.test(text)) {
    return {
      temperature: LeadTemperature.COLD,
      interest: LeadInterest.GENERAL,
      classifiedBy: LeadClassifiedBy.RULES,
      reason: text ? 'Greeting only' : 'No text in first message',
    };
  }

  const interest = INTEREST_KEYWORDS.find(([, words]) => hasAny(text, words))?.[0] ?? LeadInterest.GENERAL;
  let temperature = LeadTemperature.COLD;
  let reason = 'No buying signal';
  if (hasAny(text, HOT_KEYWORDS)) {
    temperature = LeadTemperature.HOT;
    reason = 'Asked to buy, for a price or a call';
  } else if (interest !== LeadInterest.GENERAL || hasAny(text, WARM_KEYWORDS) || text.includes('?')) {
    temperature = LeadTemperature.WARM;
    reason = 'Asking about products';
  }
  return { temperature, interest, classifiedBy: LeadClassifiedBy.RULES, reason };
}

const SYSTEM_PROMPT = `You classify WhatsApp sales leads for an insurance and mutual fund advisory business in India.
The customer's first message may be in English, Hindi, Gujarati or a mix, possibly romanized.
Reply with JSON only, no other text:
{"temperature":"hot|warm|cold","interest":"insurance|mutual_fund|claim_support|general","reason":"at most 12 words, in English"}
hot = wants to buy or start now, asks price/quote, or asks for a call.
warm = asks about products, plans or details without clear intent to buy yet.
cold = greeting only, unclear, unrelated, or not interested.
claim_support = problems with an existing insurance claim. general = none of the other interests.`;

@Injectable()
export class LeadClassifierService {
  private readonly logger = createLogger('LeadClassifier');

  constructor(@Optional() private readonly aiService?: AiService) {}

  async classify(message: string): Promise<LeadClassification> {
    const rules = classifyByRules(message);
    // A bare greeting carries nothing for the model to read; skip the paid call.
    if (!this.aiService || rules.reason === 'Greeting only' || rules.reason === 'No text in first message') {
      return rules;
    }
    try {
      const { content } = await this.aiService.complete(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message.slice(0, MAX_MESSAGE_CHARS) },
        ],
        { model: AI_MODEL, maxTokens: 400, temperature: 0, reasoningEffort: 'low' },
      );
      return parseAiClassification(content) ?? rules;
    } catch (err) {
      this.logger.warn(
        `AI lead classification failed, using keyword rules: ${err instanceof Error ? err.message : String(err)}`,
      );
      return rules;
    }
  }
}

export function parseAiClassification(content: string): LeadClassification | null {
  const json = /\{[\s\S]*\}/.exec(content)?.[0];
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { temperature?: unknown; interest?: unknown; reason?: unknown };
    const temperature = Object.values(LeadTemperature).find(t => t === parsed.temperature);
    const interest = Object.values(LeadInterest).find(i => i === parsed.interest);
    if (!temperature || !interest) return null;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '';
    return { temperature, interest, classifiedBy: LeadClassifiedBy.AI, reason };
  } catch {
    return null;
  }
}
