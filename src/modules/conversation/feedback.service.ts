import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from './entities/feedback.entity';
import { CreateFeedbackDto, SubmitFeedbackViaWhatsAppDto } from './dto/feedback.dto';
import { EngineRegistry } from '../../engine/engine-registry.service';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(Feedback, 'data') private readonly repo: Repository<Feedback>,
    @Optional() private readonly engineRegistry?: EngineRegistry,
  ) {}

  async findAll(
    businessId: string,
    opts?: { agentName?: string; minRating?: number; limit?: number; offset?: number },
  ) {
    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.businessId = :businessId', { businessId })
      .orderBy('f.createdAt', 'DESC');

    if (opts?.agentName) qb.andWhere('f.agentName = :agent', { agent: opts.agentName });
    if (opts?.minRating) qb.andWhere('f.rating >= :min', { min: opts.minRating });
    if (opts?.limit) qb.take(opts.limit);
    if (opts?.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async findOne(id: string, businessId: string) {
    const fb = await this.repo.findOne({ where: { id, businessId } });
    if (!fb) throw new NotFoundException('Feedback not found');
    return fb;
  }

  async create(businessId: string, dto: CreateFeedbackDto) {
    const feedback = this.repo.create({ ...dto, businessId });
    return this.repo.save(feedback);
  }

  async getStats(businessId: string) {
    const all = await this.repo.find({ where: { businessId } });
    const total = all.length;
    if (total === 0) return { total: 0, averageRating: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

    const sum = all.reduce((s, f) => s + f.rating, 0);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of all) {
      if (f.rating >= 1 && f.rating <= 5) distribution[f.rating]++;
    }

    const agentStats: Record<string, { total: number; sum: number; avg: number }> = {};
    for (const f of all) {
      const name = f.agentName || 'Unknown';
      if (!agentStats[name]) agentStats[name] = { total: 0, sum: 0, avg: 0 };
      agentStats[name].total++;
      agentStats[name].sum += f.rating;
    }
    for (const name of Object.keys(agentStats)) {
      agentStats[name].avg = Math.round((agentStats[name].sum / agentStats[name].total) * 10) / 10;
    }

    return {
      total,
      averageRating: Math.round((sum / total) * 10) / 10,
      distribution,
      agentStats,
    };
  }

  async requestFeedbackViaWhatsApp(businessId: string, dto: SubmitFeedbackViaWhatsAppDto) {
    const engine = this.engineRegistry?.get(dto.sessionId);
    if (!engine) {
      this.logger.warn(`No engine found for session ${dto.sessionId}`);
      return { success: false, reason: 'Session not connected' };
    }

    try {
      const feedbackMsg = [
        '⭐ *How was your experience?*',
        '',
        'Please rate your consultation:',
        '1️⃣ - Poor',
        '2️⃣ - Below Average',
        '3️⃣ - Average',
        '4️⃣ - Good',
        '5️⃣ - Excellent',
        '',
        'Reply with a number (1-5) and optionally add your feedback after it.',
        'Example: "5 Great service!"',
      ].join('\n');

      await engine.sendTextMessage(dto.chatId, feedbackMsg);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send feedback request: ${error}`);
      return { success: false, reason: String(error) };
    }
  }

  async remove(id: string, businessId: string) {
    const fb = await this.findOne(id, businessId);
    await this.repo.remove(fb);
  }
}
