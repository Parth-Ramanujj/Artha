import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { StorageService } from '../../common/storage/storage.service';
import { AiService } from '../ai/ai.service';
import { CampaignService } from '../campaign/campaign.service';
import { MessageService } from '../message/message.service';
import { assertBase64WithinMediaCap, stripBase64DataUri } from '../message/media-cap.util';
import { Session } from '../session/entities/session.entity';
import { StatusService } from '../status/status.service';
import { fence, UNTRUSTED_RULE } from '../sales-agent/sales-rules';
import {
  LibraryTargetDto,
  MAX_CHATS_PER_POST,
  SaveLibraryAutomationDto,
  SaveLibraryItemDto,
  WriteLibraryPostDto,
} from './dto/library.dto';
import { LibraryAutomation, LibraryItem, LibraryRun, LibrarySchedule } from './entities/library.entity';
import { nextRunAt, scheduleProblem, toChatId } from './library-rules';

const TICK_MS = 30_000;
const MAX_AUTOMATIONS_PER_BUSINESS = 200;
/** Gap between chat sends so a long list does not look like a spam burst to WhatsApp. */
const SEND_GAP_MS = 1500;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
};

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Target {
  sessionId: string;
  postToStatus: boolean;
  chatIds: string[];
}

@Injectable()
export class LibraryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LibraryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    @InjectRepository(LibraryItem, 'data') private readonly items: Repository<LibraryItem>,
    @InjectRepository(LibraryAutomation, 'data') private readonly automations: Repository<LibraryAutomation>,
    @InjectRepository(LibraryRun, 'data') private readonly runs: Repository<LibraryRun>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    private readonly storage: StorageService,
    private readonly messages: MessageService,
    private readonly status: StatusService,
    private readonly campaigns: CampaignService,
    private readonly ai: AiService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Items ──

  async listItems(businessId: string): Promise<LibraryItem[]> {
    return this.items.find({ where: { businessId }, order: { updatedAt: 'DESC' } });
  }

  async getItem(businessId: string, id: string): Promise<LibraryItem> {
    const item = await this.items.findOne({ where: { id, businessId } });
    if (!item) throw new NotFoundException('Post not found');
    return item;
  }

  async saveItem(businessId: string, dto: SaveLibraryItemDto, id?: string): Promise<LibraryItem> {
    const item = id
      ? await this.getItem(businessId, id)
      : this.items.create({ businessId, tags: [], type: 'text', mediaPath: null, mediaMimetype: null });
    item.title = dto.title.trim();
    item.category = (dto.category ?? item.category ?? '').trim();
    item.tags = [...new Set((dto.tags ?? item.tags ?? []).map(t => t.trim()).filter(Boolean))];
    item.text = dto.text ?? item.text ?? '';

    const oldPath = item.mediaPath;
    if (dto.media) {
      const base64 = stripBase64DataUri(dto.media.base64) ?? '';
      assertBase64WithinMediaCap(base64);
      const path = `library/${businessId}/${randomUUID()}.${EXT[dto.media.mimetype]}`;
      await this.storage.putFile(path, Buffer.from(base64, 'base64'));
      item.mediaPath = path;
      item.mediaMimetype = dto.media.mimetype;
    } else if (dto.removeMedia) {
      item.mediaPath = null;
      item.mediaMimetype = null;
    }
    item.type = item.mediaMimetype?.startsWith('video/') ? 'video' : item.mediaMimetype ? 'image' : 'text';
    if (item.type === 'text' && !item.text.trim())
      throw new BadRequestException('Write the post text or add a photo/video');

    const saved = await this.items.save(item);
    if (oldPath && oldPath !== saved.mediaPath) await this.dropFile(oldPath);
    return saved;
  }

  async deleteItem(businessId: string, id: string): Promise<void> {
    const item = await this.getItem(businessId, id);
    const used = (await this.automations.find({ where: { businessId } })).filter(a => a.itemIds.includes(id));
    if (used.length) {
      throw new BadRequestException(`Used by automation "${used[0].name}". Remove it from there first.`);
    }
    await this.items.remove(item);
    if (item.mediaPath) await this.dropFile(item.mediaPath);
  }

  async itemMedia(businessId: string, id: string): Promise<{ buffer: Buffer; mimetype: string }> {
    const item = await this.getItem(businessId, id);
    if (!item.mediaPath || !item.mediaMimetype) throw new NotFoundException('This post has no media');
    return { buffer: await this.storage.getFile(item.mediaPath), mimetype: item.mediaMimetype };
  }

  private async dropFile(path: string): Promise<void> {
    await this.storage.deleteFile(path).catch(err => this.logger.warn(`Could not delete ${path}: ${errMsg(err)}`));
  }

  // ── Sending ──

  /** Checks the number belongs to the business and turns typed numbers into chat ids. */
  private async target(businessId: string, dto: LibraryTargetDto): Promise<Target> {
    if (!(await this.sessions.findOne({ where: { id: dto.sessionId, businessId }, select: { id: true } }))) {
      throw new BadRequestException('That WhatsApp number does not belong to this business');
    }
    const chatIds: string[] = [];
    for (const raw of dto.chatIds ?? []) {
      if (!raw.trim()) continue;
      const id = toChatId(raw);
      if (!id) throw new BadRequestException(`"${raw}" is not a phone number or chat id`);
      chatIds.push(id);
    }
    const unique = [...new Set(chatIds)].slice(0, MAX_CHATS_PER_POST);
    if (!dto.postToStatus && !unique.length) throw new BadRequestException('Pick WhatsApp Status or at least one chat');
    return { sessionId: dto.sessionId, postToStatus: !!dto.postToStatus, chatIds: unique };
  }

  async postNow(businessId: string, itemId: string, dto: LibraryTargetDto): Promise<LibraryRun> {
    const item = await this.getItem(businessId, itemId);
    return this.deliver(businessId, item, await this.target(businessId, dto), null);
  }

  /** Posts one item to every target and records the run; per-chat failures never stop the rest. */
  private async deliver(
    businessId: string,
    item: LibraryItem,
    target: Target,
    automationId: string | null,
  ): Promise<LibraryRun> {
    const run = this.runs.create({
      businessId,
      automationId,
      itemId: item.id,
      itemTitle: item.title,
      sessionId: target.sessionId,
      postedToStatus: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: null,
    });
    const errors: string[] = [];
    try {
      const media =
        item.mediaPath && item.mediaMimetype
          ? { base64: (await this.storage.getFile(item.mediaPath)).toString('base64'), mimetype: item.mediaMimetype }
          : null;

      if (target.postToStatus) {
        try {
          if (!media) await this.status.postTextStatus(target.sessionId, item.text, {});
          else if (item.type === 'video')
            await this.status.postVideoStatus(target.sessionId, media, { caption: item.text || undefined });
          else await this.status.postImageStatus(target.sessionId, media, { caption: item.text || undefined });
          run.postedToStatus = true;
        } catch (err) {
          errors.push(`Status: ${errMsg(err)}`);
        }
      }

      for (const [i, chatId] of target.chatIds.entries()) {
        if (i > 0) await sleep(SEND_GAP_MS);
        try {
          if (await this.campaigns.isOptedOut(businessId, target.sessionId, chatId)) {
            run.skipped++;
            continue;
          }
          if (!media) await this.messages.sendText(target.sessionId, { chatId, text: item.text });
          else if (item.type === 'video')
            await this.messages.sendVideo(target.sessionId, { chatId, ...media, caption: item.text || undefined });
          else await this.messages.sendImage(target.sessionId, { chatId, ...media, caption: item.text || undefined });
          run.sent++;
        } catch (err) {
          run.failed++;
          if (errors.length < 5) errors.push(`${chatId.replace(/@.*$/, '')}: ${errMsg(err)}`);
        }
      }
    } catch (err) {
      errors.push(errMsg(err));
    }
    run.error = errors.length ? errors.join('\n').slice(0, 2000) : null;
    if (run.postedToStatus || run.sent) {
      await this.items.update(item.id, { useCount: item.useCount + 1, lastUsedAt: new Date() });
    }
    return this.runs.save(run);
  }

  async listRuns(businessId: string): Promise<LibraryRun[]> {
    return this.runs.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  // ── Automations ──

  async listAutomations(businessId: string): Promise<LibraryAutomation[]> {
    return this.automations.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  private async getAutomation(businessId: string, id: string): Promise<LibraryAutomation> {
    const a = await this.automations.findOne({ where: { id, businessId } });
    if (!a) throw new NotFoundException('Automation not found');
    return a;
  }

  async saveAutomation(
    businessId: string,
    dto: SaveLibraryAutomationDto,
    id?: string,
    createdBy?: string,
  ): Promise<LibraryAutomation> {
    const schedule: LibrarySchedule = {
      kind: dto.schedule.kind,
      timezone: dto.schedule.timezone,
      ...(dto.schedule.kind === 'once' ? { at: dto.schedule.at } : { time: dto.schedule.time }),
      ...(dto.schedule.kind === 'weekly' ? { days: [...new Set(dto.schedule.days ?? [])].sort() } : {}),
    };
    const problem = scheduleProblem(schedule);
    if (problem) throw new BadRequestException(problem);

    const itemIds = [...new Set(dto.itemIds)];
    if (!itemIds.length) throw new BadRequestException('Pick at least one post');
    const found = await this.items.count({ where: { businessId, id: In(itemIds) } });
    if (found !== itemIds.length) throw new BadRequestException('Some picked posts no longer exist');
    const target = await this.target(businessId, dto);

    let a: LibraryAutomation;
    if (id) {
      a = await this.getAutomation(businessId, id);
    } else {
      if ((await this.automations.count({ where: { businessId } })) >= MAX_AUTOMATIONS_PER_BUSINESS) {
        throw new BadRequestException(`At most ${MAX_AUTOMATIONS_PER_BUSINESS} automations per business`);
      }
      a = this.automations.create({ businessId, cursor: 0, runCount: 0, createdBy: createdBy ?? null });
    }
    Object.assign(a, {
      name: dto.name.trim(),
      itemIds,
      sessionId: target.sessionId,
      postToStatus: target.postToStatus,
      chatIds: target.chatIds,
      schedule,
      enabled: dto.enabled ?? a.enabled ?? true,
      lastError: null,
    });
    if (a.cursor >= itemIds.length) a.cursor = 0;
    a.nextRunAt = a.enabled ? nextRunAt(schedule, new Date()) : null;
    return this.automations.save(a);
  }

  async toggleAutomation(businessId: string, id: string, enabled: boolean): Promise<LibraryAutomation> {
    const a = await this.getAutomation(businessId, id);
    a.enabled = enabled;
    a.nextRunAt = enabled ? nextRunAt(a.schedule, new Date()) : null;
    if (enabled && !a.nextRunAt)
      throw new BadRequestException('That one-time schedule has passed. Edit it to pick a new time.');
    return this.automations.save(a);
  }

  async deleteAutomation(businessId: string, id: string): Promise<void> {
    await this.automations.remove(await this.getAutomation(businessId, id));
  }

  /** Runs the automation's next item right away; its schedule stays as it is. */
  async runAutomationNow(businessId: string, id: string): Promise<LibraryRun> {
    return this.runAutomation(await this.getAutomation(businessId, id));
  }

  private async runAutomation(a: LibraryAutomation): Promise<LibraryRun> {
    const itemId = a.itemIds[a.cursor % Math.max(1, a.itemIds.length)];
    const item = itemId ? await this.items.findOne({ where: { id: itemId, businessId: a.businessId } }) : null;
    let run: LibraryRun;
    if (!item) {
      run = await this.runs.save(
        this.runs.create({
          businessId: a.businessId,
          automationId: a.id,
          itemId: itemId ?? null,
          itemTitle: '',
          sessionId: a.sessionId,
          error: 'The post was deleted',
        }),
      );
    } else {
      run = await this.deliver(a.businessId, item, a, a.id);
    }
    await this.automations.update(a.id, {
      cursor: (a.cursor + 1) % Math.max(1, a.itemIds.length),
      runCount: a.runCount + 1,
      lastRunAt: new Date(),
      lastError: run.error,
    });
    return run;
  }

  /** Fires due automations. The next run time is claimed BEFORE sending, so a slow send never double-posts. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      // shortcut: one in-process scheduler; with several API replicas each would fire, add a DB lock then.
      const due = await this.automations.find({
        where: { enabled: true, nextRunAt: LessThanOrEqual(now) },
        order: { nextRunAt: 'ASC' },
        take: 20,
      });
      for (const a of due) {
        const next = nextRunAt(a.schedule, now);
        await this.automations.update(a.id, { nextRunAt: next, ...(next ? {} : { enabled: false }) });
        try {
          await this.runAutomation(a);
        } catch (err) {
          this.logger.error(`Library automation ${a.id} failed: ${errMsg(err)}`);
          await this.automations.update(a.id, { lastError: errMsg(err).slice(0, 2000), lastRunAt: new Date() });
        }
      }
    } catch (err) {
      this.logger.error(`Library scheduler tick failed: ${errMsg(err)}`);
    } finally {
      this.ticking = false;
    }
  }

  // ── Overview + AI ──

  async overview(businessId: string) {
    const [items, automations, runs] = await Promise.all([
      this.items.find({ where: { businessId }, select: { type: true, category: true } }),
      this.automations.find({ where: { businessId }, select: { enabled: true, nextRunAt: true } }),
      this.runs.find({
        where: { businessId },
        order: { createdAt: 'DESC' },
        take: 500,
        select: { sent: true, postedToStatus: true, createdAt: true },
      }),
    ]);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = runs.filter(r => new Date(r.createdAt).getTime() >= weekAgo);
    const upcoming = automations
      .filter(a => a.enabled && a.nextRunAt)
      .map(a => new Date(a.nextRunAt as Date).getTime())
      .sort((x, y) => x - y)[0];
    return {
      items: items.length,
      byType: {
        text: items.filter(i => i.type === 'text').length,
        image: items.filter(i => i.type === 'image').length,
        video: items.filter(i => i.type === 'video').length,
      },
      categories: [...new Set(items.map(i => i.category).filter(Boolean))].sort(),
      activeAutomations: automations.filter(a => a.enabled).length,
      nextRunAt: upcoming ? new Date(upcoming).toISOString() : null,
      sentThisWeek: recent.reduce((n, r) => n + r.sent, 0),
      statusPostsThisWeek: recent.filter(r => r.postedToStatus).length,
    };
  }

  async writePost(dto: WriteLibraryPostDto): Promise<{ text: string }> {
    const language = dto.language || 'English';
    const shape =
      dto.format === 'status'
        ? 'a WhatsApp Status caption: 15 to 50 words, punchy, 1 to 3 emojis'
        : 'a WhatsApp message: 40 to 120 words, warm and personal, short lines, at most 3 emojis, end with a clear next step';
    const { content } = await this.ai.complete(
      [
        {
          role: 'system',
          content: [
            `You write WhatsApp marketing content for a small business. Write in ${language}${language === 'English' ? '' : ' script'}.`,
            `Tone: ${dto.tone || 'friendly and professional'}.`,
            'Never invent prices, discounts, guarantees, returns, statistics or contact details. Do not use fear or fake urgency.',
            'Use WhatsApp formatting (*bold*) sparingly. Plain text, no hashtags unless asked.',
            UNTRUSTED_RULE,
          ].join('\n'),
        },
        { role: 'user', content: `Write ${shape} about:\n${fence(dto.topic, 'owner-topic')}\nReturn ONLY the text.` },
      ],
      { maxTokens: 600, temperature: 0.8 },
    );
    return { text: content.trim().slice(0, 4000) };
  }
}
