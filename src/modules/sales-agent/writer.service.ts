import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import {
  SalesAgentConfig,
  SalesChannelName,
  SalesCompany,
  SalesOutboxItem,
  SalesProspect,
} from './entities/sales-agent.entity';
import { fence, parseJson, preSendProblems, UNTRUSTED_RULE } from './sales-rules';

const MAX_WRITE_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

interface DraftStep {
  subject?: string;
  body?: string;
  delayDays?: number;
}

const COMMON_RULES = `- Never use em dashes, exclamation marks or the words "I hope this finds you well".
- Never start with "I" or "We".
- Exactly ONE question or call to action per message.
- Never invent facts. Only use what FACTS says; if FACTS is thin, ask a simple relevant question instead.
- No spammy words (free, guarantee, act now, limited time). Plain, human, specific.
- Do not add an opt-out line or signature block; it is added automatically.`;

const CHANNEL_RULES: Record<SalesChannelName, string> = {
  whatsapp: `Write a WhatsApp outreach sequence of 2 messages.
- Message 1 (delayDays 0): under 50 words, greet by first name if known (else the business name), say who you are in a few words, one specific observation from FACTS, one short question. No links.
- Message 2 (delayDays 3): a gentle follow-up under 35 words with one proof point or benefit. At most one link, only the booking link if given.
- WhatsApp style: short lines, conversational, no subject, no formatting symbols.
Return JSON: {"messages":[{"body":"...","delayDays":0},{"body":"...","delayDays":3}]}`,
  email: `Write a cold email sequence of 3 emails.
- Email 1 (delayDays 0): under 75 words, one specific observation from FACTS and one question. No pitch, no links.
- Email 2 (delayDays 3): under 75 words, one proof point or benefit.
- Email 3 (delayDays 4): breakup email under 40 words.
- Subjects: lowercase, 2 to 5 words. Plain text only.
Return JSON: {"messages":[{"subject":"...","body":"...","delayDays":0}, ...]}`,
};

@Injectable()
export class SalesWriterService {
  private readonly logger = new Logger(SalesWriterService.name);

  constructor(
    private readonly ai: AiService,
    @InjectRepository(SalesProspect, 'data') private readonly prospects: Repository<SalesProspect>,
    @InjectRepository(SalesCompany, 'data') private readonly companies: Repository<SalesCompany>,
    @InjectRepository(SalesOutboxItem, 'data') private readonly outbox: Repository<SalesOutboxItem>,
  ) {}

  /** Drafts a personal sequence for one prospect into the outbox. Returns true when queued. */
  async write(config: SalesAgentConfig, prospect: SalesProspect, channel: SalesChannelName): Promise<boolean> {
    const company = prospect.companyId ? await this.companies.findOne({ where: { id: prospect.companyId } }) : null;
    let steps: DraftStep[];
    try {
      const { content } = await this.ai.complete(
        [
          { role: 'system', content: this.systemPrompt(config) },
          { role: 'user', content: this.userPrompt(config, prospect, company, channel) },
        ],
        { maxTokens: 1200, temperature: 0.7 },
      );
      const parsed = parseJson<{ messages?: DraftStep[] } | DraftStep[]>(content);
      steps = (Array.isArray(parsed) ? parsed : (parsed?.messages ?? [])).slice(0, channel === 'whatsapp' ? 2 : 3);
    } catch (err) {
      // Provider outage: try again next cycle without counting it against the prospect.
      this.logger.warn(`Writer LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    const usable = steps
      .map(s => ({
        subject: channel === 'email' ? String(s.subject ?? '').slice(0, 120) : '',
        body: String(s.body ?? '')
          .trim()
          .slice(0, 2000),
        delayDays: Math.max(0, Math.min(Number(s.delayDays) || 0, 14)),
      }))
      .filter(s => s.body);
    const bad = usable.length === 0 || usable.some(s => preSendProblems(channel, 'sequence', s).length > 0);
    if (bad) {
      prospect.writeAttempts += 1;
      if (prospect.writeAttempts >= MAX_WRITE_ATTEMPTS) prospect.status = 'write_failed';
      await this.prospects.save(prospect);
      return false;
    }

    let at = Date.now();
    const rows = usable.map((s, i) => {
      at += (i === 0 ? 0 : Math.max(1, s.delayDays)) * DAY_MS;
      return this.outbox.create({
        businessId: config.businessId,
        prospectId: prospect.id,
        channel,
        kind: 'sequence',
        step: i + 1,
        subject: s.subject,
        body: s.body,
        status: config.requireApproval ? 'pending_review' : 'approved',
        approvedBy: config.requireApproval ? '' : 'autopilot',
        sendAt: new Date(at),
      });
    });
    await this.outbox.save(rows);
    prospect.status = 'queued';
    prospect.channel = channel;
    await this.prospects.save(prospect);
    return true;
  }

  systemPrompt(config: SalesAgentConfig): string {
    const p = config.persona;
    const prod = config.product;
    return [
      `You are ${p.name || 'a sales rep'}, ${p.role || 'founder'} at ${p.company || prod.name}. Tone: ${p.tone || 'friendly, direct'}.`,
      `You sell ${prod.name}: ${prod.description}`,
      prod.pricing ? `Pricing: ${prod.pricing}` : '',
      prod.benefits?.length ? `Key benefits: ${prod.benefits.join('; ')}` : '',
      `Goal of the conversation: ${prod.goal || 'book a short call'}.`,
      prod.bookingUrl ? `Booking link: ${prod.bookingUrl}` : '',
      UNTRUSTED_RULE,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private userPrompt(
    config: SalesAgentConfig,
    prospect: SalesProspect,
    company: SalesCompany | null,
    channel: SalesChannelName,
  ): string {
    const facts = [
      prospect.name && `Name: ${prospect.name}`,
      prospect.title && `Title: ${prospect.title}`,
      `Business: ${prospect.companyName || company?.name || 'unknown'}`,
      company?.industry && `Industry: ${company.industry}`,
      company?.location && `Location: ${company.location}`,
      company?.website && `Website: ${company.website}`,
      ...(company?.signals ?? []).slice(0, 5).map(s => `Signal ${s.code}: ${s.detail}`),
      prospect.notes && `Notes: ${prospect.notes}`,
    ]
      .filter(Boolean)
      .join('\n');
    return [
      CHANNEL_RULES[channel],
      COMMON_RULES,
      config.icp.titles?.length ? `Ideal buyer titles: ${config.icp.titles.join(', ')}` : '',
      `FACTS:\n${fence(facts, 'prospect-facts')}`,
      'Respond ONLY with valid JSON, no commentary.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
