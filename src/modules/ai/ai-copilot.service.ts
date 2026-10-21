import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';
import { CopilotRequestDto, VoicePreviewDto } from './dto/ai-agent.dto';
import { parseJsonObject } from './ai-agent.service';

export type CopilotResult =
  | { summary: string; sentiment: 'positive' | 'neutral' | 'urgent' }
  | { replies: Array<{ tag: string; text: string }> }
  | { text: string };

/** Voices the preview can play: the AI calling voices (Bulbul v4) plus English (Bulbul v3). */
export const PREVIEW_VOICES = [
  {
    code: 'gu-IN',
    label: 'Gujarati',
    model: 'bulbul:v4-flash',
    voices: [
      { id: 'pooja_gu_customer', label: 'Pooja — customer care (female)' },
      { id: 'pooja_gu_conversational', label: 'Pooja — conversational (female)' },
      { id: 'bhavik_gu_conversation', label: 'Bhavik — conversational (male)' },
    ],
  },
  {
    code: 'hi-IN',
    label: 'Hindi',
    model: 'bulbul:v4-flash',
    voices: [
      { id: 'ritu_hi_customer_warm', label: 'Ritu — warm customer care (female)' },
      { id: 'aparna_hi_customer', label: 'Aparna — customer care (female)' },
      { id: 'shubh_hi_customer', label: 'Shubh — customer care (male)' },
      { id: 'amit_hi_conversational', label: 'Amit — conversational (male)' },
    ],
  },
  {
    code: 'en-IN',
    label: 'English (India)',
    model: 'bulbul:v3',
    voices: [
      { id: 'priya', label: 'Priya (female)' },
      { id: 'shubh', label: 'Shubh (male)' },
    ],
  },
] as const;

const SENTIMENTS = new Set(['positive', 'neutral', 'urgent']);

/** The chat Copilot for team members, and the Sarvam voice preview. Never answers with made-up text. */
@Injectable()
export class AiCopilotService {
  constructor(private readonly ai: AiService) {}

  async run(dto: CopilotRequestDto): Promise<CopilotResult> {
    const who = dto.contactName?.trim() || 'the customer';
    const transcript = (dto.messages ?? [])
      .filter(m => m.text.trim())
      .slice(-30)
      .map(m => `${m.role === 'customer' ? 'CUSTOMER' : 'BUSINESS'}: ${m.text.trim()}`)
      .join('\n');

    switch (dto.task) {
      case 'summary': {
        if (!transcript) throw new BadRequestException('This chat has no messages to summarise yet');
        const data = parseJsonObject(
          await this.ask(
            `You summarise WhatsApp chats between a business and ${who} for the business's team. Answer with ONLY JSON: {"summary":"3 short lines in English, each starting with • : who they are and what they want, what was said or agreed, the recommended next step","sentiment":"positive" | "neutral" | "urgent"}. Use "urgent" for complaints, problems or time pressure. Only use facts from the chat.`,
            transcript,
          ),
        );
        const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
        if (!summary) throw new BadGatewayException('The AI did not return a summary. Try again.');
        const sentiment = SENTIMENTS.has(String(data.sentiment)) ? (data.sentiment as 'positive') : 'neutral';
        return { summary, sentiment };
      }
      case 'replies': {
        if (!transcript) throw new BadRequestException('This chat has no messages to reply to yet');
        const data = parseJsonObject(
          await this.ask(
            `You suggest replies a business can send next on WhatsApp to ${who}. Answer with ONLY JSON: {"replies":[{"tag":"2-4 word label","text":"the reply"}]} with exactly 3 different, short, friendly replies in the customer's language that answer their latest message. Never invent prices, discounts, stock or policies.`,
            transcript,
          ),
        );
        const replies = (Array.isArray(data.replies) ? data.replies : [])
          .map(r => r as { tag?: unknown; text?: unknown })
          .filter(r => typeof r.text === 'string' && r.text.trim())
          .slice(0, 3)
          .map(r => ({
            tag: typeof r.tag === 'string' && r.tag.trim() ? r.tag.trim() : 'Suggested',
            text: String(r.text).trim(),
          }));
        if (replies.length === 0) throw new BadGatewayException('The AI did not return any replies. Try again.');
        return { replies };
      }
      case 'rewrite': {
        const text = this.draft(dto.text);
        const tone = dto.tone ?? 'professional';
        return {
          text: await this.ask(
            `Rewrite the business's draft WhatsApp message in a ${tone} tone${tone === 'short' ? ' (as short as possible)' : ''}. Keep its meaning, facts and language. Do not add offers, discounts or promises that are not in the draft. Reply with the rewritten message only.`,
            text,
          ),
        };
      }
      case 'translate': {
        const text = this.draft(dto.text);
        const language = dto.language?.trim();
        if (!language) throw new BadRequestException('Choose a language');
        return {
          text: await this.ask(
            `Translate the message into ${language}, natural and polite as people write on WhatsApp. Keep names, numbers and links unchanged. Reply with the translation only.`,
            text,
          ),
        };
      }
    }
  }

  private draft(text: string | undefined): string {
    if (!text?.trim()) throw new BadRequestException('Type a message first');
    return text.trim();
  }

  private async ask(system: string, user: string): Promise<string> {
    let content: string;
    try {
      ({ content } = await this.ai.complete(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { temperature: 0.4, maxTokens: 900, reasoningEffort: 'low' },
      ));
    } catch (err) {
      throw new BadGatewayException(`The AI did not answer: ${err instanceof Error ? err.message : String(err)}`);
    }
    const out = content.trim().replace(/^"(.*)"$/s, '$1');
    if (!out) throw new BadGatewayException('The AI returned an empty answer. Try again.');
    return out;
  }

  // ── voice preview ──

  voices() {
    return {
      configured: Boolean(process.env.SARVAM_API_KEY?.trim()),
      languages: PREVIEW_VOICES.map(({ code, label, voices }) => ({ code, label, voices })),
    };
  }

  async voicePreview(dto: VoicePreviewDto): Promise<{ audio: string; mimeType: 'audio/wav' }> {
    const apiKey = process.env.SARVAM_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException('Add SARVAM_API_KEY to the server .env to enable voice');
    const language = PREVIEW_VOICES.find(l => l.code === dto.language);
    if (!language?.voices.some(v => v.id === dto.voice)) {
      throw new BadRequestException('That voice is not available for this language');
    }
    let res: Response;
    try {
      res = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: dto.text,
          target_language_code: dto.language,
          speaker: dto.voice,
          model: language.model,
          speech_sample_rate: 22050,
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new BadGatewayException(`Could not reach Sarvam: ${err instanceof Error ? err.message : String(err)}`);
    }
    const json = (await res.json().catch(() => ({}))) as { audios?: string[]; error?: { message?: string } };
    if (!res.ok || !json.audios?.[0]) {
      throw new BadGatewayException(
        `Sarvam could not make the voice sample: ${json.error?.message ?? `HTTP ${res.status}`}`,
      );
    }
    return { audio: json.audios[0], mimeType: 'audio/wav' };
  }
}
