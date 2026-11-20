import { BadRequestException, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { createLogger } from '../../common/services/logger.service';
import type { TemplateAdviceDto } from './dto/message-studio.dto';

export interface TemplateAdvice {
  /** The category Meta will most likely give this message. */
  category: 'MARKETING' | 'UTILITY';
  reason: string;
  /** Things in the draft that often get a template rejected or re-categorised. */
  risks: string[];
  /** The same message, tightened for approval, keeping its {{variables}} and *formatting*. */
  improvedBody: string;
  /** A Utility rewrite, or null when the message cannot honestly be Utility. */
  utilityBody: string | null;
  /** When/why Utility is (not) possible for this message. */
  utilityNote: string;
  tips: string[];
}

const SYSTEM = `You review WhatsApp Business message templates before they are submitted to Meta for approval.

Meta's category rules:
- UTILITY: about a specific, existing transaction, account, order, booking, appointment, payment, delivery or request the customer started or agreed to (confirmations, reminders, status updates, alerts, follow-ups to their request). Must not promote, upsell, invite, offer discounts or ask to join/register for something new. Meta re-categorises a "Utility" template that contains any promotion as Marketing.
- MARKETING: promotions, offers, invitations, announcements, re-engagement, recruiting, newsletters, anything meant to grow the business or get a new action the customer did not ask for.

Common rejection causes: a body that starts or ends with a variable, variables next to each other, too many variables for little text, vague or misleading claims ("India's first", "guaranteed", "100%"), spammy CAPS/!!!/emoji walls, missing business context, links that don't match the brand, asking for sensitive data, wrong language vs selected language.

Reply with ONLY a JSON object, no markdown:
{"category":"MARKETING"|"UTILITY","reason":string,"risks":string[],"improvedBody":string,"utilityBody":string|null,"utilityNote":string,"tips":string[]}
- improvedBody: rewrite the given body for approval in the same category you chose; keep every {{variable}} exactly as written and keep WhatsApp formatting (*bold*, _italic_); max 1024 characters.
- utilityBody: if the same goal can honestly be a Utility message (e.g. reframed as an update about the person's existing registration/request), write it without any promotion; otherwise null.
- Keep risks/tips short (max 5 each).`;

/** Pulls the JSON object out of a model reply and checks it has the advice shape. */
export function parseTemplateAdvice(raw: string): TemplateAdvice | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v
          .map(x => text(x, 300))
          .filter(Boolean)
          .slice(0, 5)
      : [];
  const category = text(data.category, 20).toUpperCase();
  const improvedBody = text(data.improvedBody, 1024);
  if ((category !== 'MARKETING' && category !== 'UTILITY') || !improvedBody) return null;
  const utilityBody = text(data.utilityBody, 1024);
  return {
    category,
    reason: text(data.reason, 600),
    risks: list(data.risks),
    improvedBody,
    utilityBody: utilityBody || null,
    utilityNote: text(data.utilityNote, 600),
    tips: list(data.tips),
  };
}

/** Asks the configured AI (Groq) how Meta will categorise a template draft and how to get it approved. */
@Injectable()
export class TemplateAdviceService {
  private readonly logger = createLogger('TemplateAdviceService');

  constructor(@Optional() private readonly ai?: AiService) {}

  async advise(dto: TemplateAdviceDto): Promise<TemplateAdvice> {
    if (!dto.body.trim()) throw new BadRequestException('Write the message first.');
    if (!this.ai) throw new ServiceUnavailableException('AI is not available on this server.');
    const draft = [
      `Selected category: ${dto.category}`,
      `Template language: ${dto.language}`,
      dto.headerText ? `Header: ${dto.headerText}` : '',
      `Body:\n"""${dto.body}"""`,
      dto.footer ? `Footer: ${dto.footer}` : '',
      dto.buttons?.length ? `Buttons: ${dto.buttons.join(' | ')}` : '',
      dto.explainIn === 'gu'
        ? 'Write reason, risks, utilityNote and tips in simple Gujarati using English letters (Gujlish). Keep improvedBody and utilityBody in the template language.'
        : 'Write reason, risks, utilityNote and tips in simple English.',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const { content } = await this.ai.complete(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: draft },
        ],
        { maxTokens: 1500, temperature: 0.3 },
      );
      const advice = parseTemplateAdvice(content);
      if (!advice) throw new Error('the AI reply was not in the expected format');
      return advice;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Template advice failed: ${reason}`);
      throw new ServiceUnavailableException(`AI suggestion failed: ${reason}`);
    }
  }
}
