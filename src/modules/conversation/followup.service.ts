import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { FollowupRule, FollowupTrigger } from './entities/followup-rule.entity';
import { Conversation } from './entities/conversation.entity';
import { CreateFollowupRuleDto, UpdateFollowupRuleDto } from './dto/followup-rule.dto';
import { EngineRegistry } from '../../engine/engine-registry.service';

@Injectable()
export class FollowupService {
  private readonly logger = new Logger(FollowupService.name);

  constructor(
    @InjectRepository(FollowupRule, 'data') private readonly ruleRepo: Repository<FollowupRule>,
    @InjectRepository(Conversation, 'data') private readonly convoRepo: Repository<Conversation>,
    @Optional() private readonly engineRegistry?: EngineRegistry,
  ) {}

  async findAllRules(businessId: string) {
    return this.ruleRepo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  async findOneRule(id: string, businessId: string) {
    const rule = await this.ruleRepo.findOne({ where: { id, businessId } });
    if (!rule) throw new NotFoundException('Follow-up rule not found');
    return rule;
  }

  async createRule(businessId: string, dto: CreateFollowupRuleDto) {
    const rule = this.ruleRepo.create({ ...dto, businessId });
    return this.ruleRepo.save(rule);
  }

  async updateRule(id: string, businessId: string, dto: UpdateFollowupRuleDto) {
    const rule = await this.findOneRule(id, businessId);
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async removeRule(id: string, businessId: string) {
    const rule = await this.findOneRule(id, businessId);
    await this.ruleRepo.remove(rule);
  }

  async getDroppedUsers(businessId: string, idleMinutes = 60) {
    const cutoff = new Date(Date.now() - idleMinutes * 60 * 1000);
    const conversations = await this.convoRepo.find({
      where: {
        businessId,
        status: 'open' as any,
        lastMessageAt: LessThan(cutoff),
      },
      order: { lastMessageAt: 'ASC' },
    });

    return conversations.map(c => ({
      conversationId: c.id,
      chatId: c.chatId,
      chatName: c.chatName,
      sessionId: c.sessionId,
      lastMessageAt: c.lastMessageAt,
      minutesIdle: c.lastMessageAt ? Math.round((Date.now() - new Date(c.lastMessageAt).getTime()) / 60000) : 0,
    }));
  }

  async sendFollowup(businessId: string, conversationId: string, sessionId: string, chatId: string, message: string) {
    const engine = this.engineRegistry?.get(sessionId);
    if (!engine) {
      return { success: false, reason: 'Session not connected' };
    }

    try {
      await engine.sendTextMessage(chatId, message);
      this.logger.log(`Follow-up sent to ${chatId} in session ${sessionId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Follow-up failed: ${error}`);
      return { success: false, reason: String(error) };
    }
  }

  async getStats(businessId: string) {
    const rules = await this.ruleRepo.find({ where: { businessId } });
    const totalRules = rules.length;
    const activeRules = rules.filter(r => r.enabled).length;
    const totalSent = rules.reduce((s, r) => s + r.totalSent, 0);
    const totalRecovered = rules.reduce((s, r) => s + r.totalRecovered, 0);
    const recoveryRate = totalSent > 0 ? Math.round((totalRecovered / totalSent) * 100) : 0;

    return { totalRules, activeRules, totalSent, totalRecovered, recoveryRate };
  }
}
