import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiCall, AiCallOutcome, AiCallStatus, ACTIVE_CALL_STATUSES } from './entities/ai-call.entity';
import { AiCallBatch, AiCallBatchStatus } from './entities/ai-call-batch.entity';
import { AiCallingSetting } from './entities/ai-calling-setting.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { ContactConsent, ConsentStatus } from '../campaign/entities/contact-consent.entity';
import { hasDndTag } from '../conversation/dnd';
import { DEFAULT_AGENT } from './call-brain';
import { CallContact, chatIdFor, toE164 } from './contacts';
import { TwilioClient, twilioConfigFromEnv } from './twilio.client';
import { createLogger } from '../../common/services/logger.service';

export const PUBLIC_URL_SETTING = 'publicUrl';
const MAX_BATCH_CONTACTS = 10_000;

export type AgentInput = Partial<Omit<VoiceAgent, 'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'isDefault'>>;

export interface CallFilters {
  status?: string;
  verified?: boolean;
  batchId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SetupStatus {
  sarvamKey: boolean;
  groqKey: boolean;
  twilioConfigured: boolean;
  twilioAccountType: string | null;
  twilioNumberOwned: boolean | null;
  twilioVerifiedCallerIds: number | null;
  twilioError: string | null;
  publicUrl: string | null;
  publicUrlReachable: boolean | null;
  readyForPhoneCalls: boolean;
}

@Injectable()
export class AiCallingService {
  private readonly logger = createLogger('AiCallingService');

  constructor(
    @InjectRepository(VoiceAgent, 'data') private readonly agentRepo: Repository<VoiceAgent>,
    @InjectRepository(AiCall, 'data') private readonly callRepo: Repository<AiCall>,
    @InjectRepository(AiCallBatch, 'data') private readonly batchRepo: Repository<AiCallBatch>,
    @InjectRepository(AiCallingSetting, 'data') private readonly settingRepo: Repository<AiCallingSetting>,
    @InjectRepository(Conversation, 'data') private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ContactConsent, 'data') private readonly consentRepo: Repository<ContactConsent>,
  ) {}

  // ── settings ──

  async getPublicUrl(): Promise<string | null> {
    const row = await this.settingRepo.findOne({ where: { key: PUBLIC_URL_SETTING } });
    const value = row?.value || process.env.AI_CALLING_PUBLIC_URL || '';
    return value.trim().replace(/\/+$/, '') || null;
  }

  async setPublicUrl(url: string): Promise<string | null> {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean && !/^https:\/\/[^\s/]+$/i.test(clean)) {
      throw new BadRequestException('Use the https address of your tunnel, e.g. https://abc.trycloudflare.com');
    }
    await this.settingRepo.save({ key: PUBLIC_URL_SETTING, value: clean });
    return clean || null;
  }

  async setupStatus(): Promise<SetupStatus> {
    const twilio = twilioConfigFromEnv();
    const publicUrl = await this.getPublicUrl();
    const status: SetupStatus = {
      sarvamKey: Boolean(process.env.SARVAM_API_KEY?.trim()),
      groqKey: Object.keys(process.env).some(k => /^GROQ_API_KEY(_\d+)?$/.test(k) && process.env[k]?.trim()),
      twilioConfigured: Boolean(twilio),
      twilioAccountType: null,
      twilioNumberOwned: null,
      twilioVerifiedCallerIds: null,
      twilioError: null,
      publicUrl,
      publicUrlReachable: null,
      readyForPhoneCalls: false,
    };
    if (twilio) {
      try {
        const check = await new TwilioClient(twilio).check();
        status.twilioAccountType = check.accountType;
        // Trial accounts get empty phone-number and caller-id lists from the API even when both exist
        // (calls still go through), so an empty list there means "unknown", not "missing".
        const trial = check.accountType === 'Trial';
        status.twilioNumberOwned = check.fromNumberOwned || (trial ? null : false);
        status.twilioVerifiedCallerIds = check.verifiedCallerIds || (trial ? null : 0);
      } catch (err) {
        status.twilioError = err instanceof Error ? err.message : String(err);
      }
    }
    if (publicUrl) {
      status.publicUrlReachable = await fetch(`${publicUrl}/api/health`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.ok)
        .catch(() => false);
    }
    status.readyForPhoneCalls =
      status.sarvamKey &&
      status.groqKey &&
      status.twilioConfigured &&
      status.twilioNumberOwned !== false &&
      status.publicUrlReachable === true;
    return status;
  }

  // ── agents ──

  async listAgents(businessId: string): Promise<VoiceAgent[]> {
    await this.getDefaultAgent(businessId);
    return this.agentRepo.find({ where: { businessId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
  }

  /** The business's default agent, created with the insurance / mutual fund script on first use. */
  async getDefaultAgent(businessId: string): Promise<VoiceAgent> {
    const existing = await this.agentRepo.findOne({ where: { businessId, isDefault: true } });
    if (existing) return existing;
    return this.agentRepo.save(this.agentRepo.create({ ...DEFAULT_AGENT, businessId, isDefault: true }));
  }

  async getAgent(businessId: string, id?: string | null): Promise<VoiceAgent> {
    if (!id) return this.getDefaultAgent(businessId);
    const agent = await this.agentRepo.findOne({ where: { id, businessId } });
    if (!agent) throw new NotFoundException('Calling agent not found');
    return agent;
  }

  async createAgent(businessId: string, input: AgentInput): Promise<VoiceAgent> {
    await this.getDefaultAgent(businessId);
    return this.agentRepo.save(
      this.agentRepo.create({ ...DEFAULT_AGENT, ...this.cleanAgentInput(input), businessId, isDefault: false }),
    );
  }

  async updateAgent(businessId: string, id: string, input: AgentInput): Promise<VoiceAgent> {
    const agent = await this.getAgent(businessId, id);
    Object.assign(agent, this.cleanAgentInput(input));
    return this.agentRepo.save(agent);
  }

  async deleteAgent(businessId: string, id: string): Promise<void> {
    const agent = await this.getAgent(businessId, id);
    if (agent.isDefault) throw new BadRequestException('The default agent cannot be deleted');
    const busy = await this.callRepo.count({
      where: { agentId: id, status: In([AiCallStatus.QUEUED, ...ACTIVE_CALL_STATUSES]) },
    });
    if (busy > 0) throw new BadRequestException('This agent still has calls queued or in progress');
    await this.agentRepo.delete({ id, businessId });
  }

  private cleanAgentInput(input: AgentInput): AgentInput {
    const out: AgentInput = { ...input };
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (out.callingStart !== undefined && !time.test(out.callingStart))
      throw new BadRequestException('callingStart must be HH:MM');
    if (out.callingEnd !== undefined && !time.test(out.callingEnd))
      throw new BadRequestException('callingEnd must be HH:MM');
    if (out.defaultLanguage !== undefined && !['gu-IN', 'hi-IN'].includes(out.defaultLanguage)) {
      throw new BadRequestException('defaultLanguage must be gu-IN or hi-IN');
    }
    if (out.callingTimezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: out.callingTimezone });
      } catch {
        throw new BadRequestException('Unknown time zone');
      }
    }
    if (out.pace !== undefined) out.pace = Math.min(1.3, Math.max(0.8, Number(out.pace) || 1));
    if (out.maxCallSeconds !== undefined)
      out.maxCallSeconds = Math.min(900, Math.max(60, Math.round(out.maxCallSeconds)));
    if (out.concurrency !== undefined) out.concurrency = Math.min(10, Math.max(1, Math.round(out.concurrency)));
    if (out.maxAttempts !== undefined) out.maxAttempts = Math.min(5, Math.max(1, Math.round(out.maxAttempts)));
    if (out.retryAfterMinutes !== undefined)
      out.retryAfterMinutes = Math.min(1440, Math.max(5, Math.round(out.retryAfterMinutes)));
    return out;
  }

  // ── do-not-call ──

  /** Opted out on WhatsApp (DND tag or consent), or asked an AI call not to be called again. */
  async isDoNotCall(businessId: string, phone: string): Promise<boolean> {
    const digits = phone.replace(/\D/g, '');
    const ids = [chatIdFor(phone), digits, `+${digits}`];
    const consent = await this.consentRepo.findOne({
      where: { businessId, waContactId: In(ids), status: ConsentStatus.OPTED_OUT },
      select: { id: true },
    });
    if (consent) return true;
    const conversations = await this.conversationRepo.find({
      where: { businessId, chatId: In(ids) },
      select: { id: true, tags: true },
    });
    if (conversations.some(c => hasDndTag(c.tags))) return true;
    const refused = await this.callRepo.count({ where: { businessId, phone, outcome: AiCallOutcome.DO_NOT_CALL } });
    return refused > 0;
  }

  // ── queue ──

  async queueCall(
    businessId: string,
    input: {
      phone: string;
      name?: string | null;
      agentId?: string | null;
      leadId?: string | null;
      batchId?: string | null;
    },
  ): Promise<AiCall> {
    const phone = toE164(input.phone);
    if (!phone) throw new BadRequestException('Enter a valid mobile number, e.g. 98765 43210');
    const agent = await this.getAgent(businessId, input.agentId);
    const active = await this.callRepo.findOne({
      where: { businessId, phone, status: In([AiCallStatus.QUEUED, ...ACTIVE_CALL_STATUSES]) },
    });
    if (active) throw new BadRequestException('This number already has a call queued or in progress');
    const blocked = await this.isDoNotCall(businessId, phone);
    return this.callRepo.save(
      this.callRepo.create({
        businessId,
        agentId: agent.id,
        batchId: input.batchId ?? null,
        leadId: input.leadId ?? null,
        phone,
        contactName: input.name?.trim().slice(0, 120) || null,
        channel: 'phone',
        status: blocked ? AiCallStatus.SKIPPED : AiCallStatus.QUEUED,
        error: blocked ? 'Contact opted out (DND)' : null,
        nextAttemptAt: blocked ? null : new Date(),
      }),
    );
  }

  async createBatch(
    businessId: string,
    input: { name: string; agentId?: string | null; contacts: CallContact[]; sendWhatsapp?: boolean; source?: string },
  ): Promise<AiCallBatch & { queued: number; skipped: number }> {
    const agent = await this.getAgent(businessId, input.agentId);
    const contacts: CallContact[] = [];
    const seen = new Set<string>();
    for (const c of input.contacts.slice(0, MAX_BATCH_CONTACTS)) {
      const phone = toE164(c.phone);
      if (phone && !seen.has(phone)) {
        seen.add(phone);
        contacts.push({ phone, name: c.name?.trim().slice(0, 120) || null });
      }
    }
    if (contacts.length === 0) throw new BadRequestException('No valid phone numbers in this list');

    const batch = await this.batchRepo.save(
      this.batchRepo.create({
        businessId,
        agentId: agent.id,
        name: input.name.trim().slice(0, 150) || 'Call list',
        source: input.source === 'leads' ? 'leads' : 'upload',
        status: AiCallBatchStatus.RUNNING,
        totalContacts: contacts.length,
        sendWhatsapp: Boolean(input.sendWhatsapp),
      }),
    );

    const busy = new Set(
      (
        await this.callRepo.find({
          where: { businessId, status: In([AiCallStatus.QUEUED, ...ACTIVE_CALL_STATUSES]) },
          select: { phone: true },
        })
      ).map(c => c.phone),
    );
    let skipped = 0;
    const rows: AiCall[] = [];
    for (const c of contacts) {
      const blocked = busy.has(c.phone)
        ? 'Already queued in another list'
        : (await this.isDoNotCall(businessId, c.phone))
          ? 'Contact opted out (DND)'
          : null;
      if (blocked) skipped++;
      rows.push(
        this.callRepo.create({
          businessId,
          agentId: agent.id,
          batchId: batch.id,
          phone: c.phone,
          contactName: c.name,
          channel: 'phone',
          status: blocked ? AiCallStatus.SKIPPED : AiCallStatus.QUEUED,
          error: blocked,
          nextAttemptAt: blocked ? null : new Date(),
        }),
      );
    }
    for (let i = 0; i < rows.length; i += 200) await this.callRepo.save(rows.slice(i, i + 200));
    return { ...batch, queued: rows.length - skipped, skipped };
  }

  async listBatches(
    businessId: string,
  ): Promise<Array<AiCallBatch & { counts: Record<string, number>; verified: number }>> {
    const batches = await this.batchRepo.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 100 });
    if (batches.length === 0) return [];
    const rows = await this.callRepo
      .createQueryBuilder('c')
      .select('c.batchId', 'batchId')
      .addSelect('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(CASE WHEN c.isVerifiedLead = :yes THEN 1 ELSE 0 END)', 'verified')
      .where('c.batchId IN (:...ids)', { ids: batches.map(b => b.id) })
      .setParameter('yes', true)
      .groupBy('c.batchId')
      .addGroupBy('c.status')
      .getRawMany<{ batchId: string; status: string; count: string; verified: string }>();
    return batches.map(b => {
      const mine = rows.filter(r => r.batchId === b.id);
      return {
        ...b,
        counts: Object.fromEntries(mine.map(r => [r.status, Number(r.count)])),
        verified: mine.reduce((sum, r) => sum + Number(r.verified || 0), 0),
      };
    });
  }

  async setBatchStatus(businessId: string, id: string, action: 'pause' | 'resume' | 'cancel'): Promise<AiCallBatch> {
    const batch = await this.batchRepo.findOne({ where: { id, businessId } });
    if (!batch) throw new NotFoundException('Call list not found');
    if (batch.status === AiCallBatchStatus.CANCELED || batch.status === AiCallBatchStatus.COMPLETED) {
      throw new BadRequestException(`This list is already ${batch.status}`);
    }
    if (action === 'cancel') {
      batch.status = AiCallBatchStatus.CANCELED;
      await this.callRepo.update(
        { batchId: id, status: AiCallStatus.QUEUED },
        { status: AiCallStatus.CANCELED, error: 'List cancelled' },
      );
    } else {
      batch.status = action === 'pause' ? AiCallBatchStatus.PAUSED : AiCallBatchStatus.RUNNING;
    }
    return this.batchRepo.save(batch);
  }

  // ── call log ──

  async listCalls(businessId: string, filters: CallFilters): Promise<{ items: AiCall[]; total: number }> {
    const qb = this.callRepo
      .createQueryBuilder('c')
      .where('c.businessId = :businessId', { businessId })
      .andWhere("c.channel = 'phone'");
    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.verified !== undefined) qb.andWhere('c.isVerifiedLead = :verified', { verified: filters.verified });
    if (filters.batchId) qb.andWhere('c.batchId = :batchId', { batchId: filters.batchId });
    if (filters.search?.trim()) {
      qb.andWhere('(c.phone LIKE :q OR c.contactName LIKE :q)', { q: `%${filters.search.trim()}%` });
    }
    const [items, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .take(Math.min(200, Math.max(1, filters.limit ?? 50)))
      .skip(Math.max(0, filters.offset ?? 0))
      .getManyAndCount();
    return { items, total };
  }

  async getCall(businessId: string, id: string): Promise<AiCall> {
    const call = await this.callRepo.findOne({ where: { id, businessId } });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }

  async cancelCall(businessId: string, id: string): Promise<AiCall> {
    const call = await this.getCall(businessId, id);
    if (call.status !== AiCallStatus.QUEUED) throw new BadRequestException('Only a queued call can be cancelled');
    call.status = AiCallStatus.CANCELED;
    call.error = 'Cancelled by a team member';
    return this.callRepo.save(call);
  }

  async stats(businessId: string): Promise<Record<string, number>> {
    const rows = await this.callRepo
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('c.businessId = :businessId', { businessId })
      .andWhere("c.channel = 'phone'")
      .groupBy('c.status')
      .getRawMany<{ status: string; count: string }>();
    const verified = await this.callRepo.count({ where: { businessId, channel: 'phone', isVerifiedLead: true } });
    return { ...Object.fromEntries(rows.map(r => [r.status, Number(r.count)])), verified };
  }

  /** A browser test call: logged like a call but never dialled, never a lead, never messaged. */
  async createTestCall(businessId: string, agentId?: string | null): Promise<AiCall> {
    const agent = await this.getAgent(businessId, agentId);
    this.logger.log(`Browser test call started for agent ${agent.id}`);
    return this.callRepo.save(
      this.callRepo.create({
        businessId,
        agentId: agent.id,
        phone: 'browser',
        contactName: null,
        channel: 'browser',
        status: AiCallStatus.DIALING,
        startedAt: new Date(),
      }),
    );
  }

  async listTestCalls(businessId: string): Promise<AiCall[]> {
    return this.callRepo.find({ where: { businessId, channel: 'browser' }, order: { createdAt: 'DESC' }, take: 20 });
  }
}
