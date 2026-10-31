import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { CampaignModule } from '../campaign/campaign.module';
import { MessageModule } from '../message/message.module';
import { Session } from '../session/entities/session.entity';
import { StatusModule } from '../status/status.module';
import { LibraryAutomation, LibraryItem, LibraryRun } from './entities/library.entity';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

/**
 * Library: a business's reusable posts (text, image, video) and automations that post them to
 * WhatsApp Status and/or send them to chats — once, daily or weekly, rotating through several posts.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LibraryItem, LibraryAutomation, LibraryRun, Session], 'data'),
    AiModule,
    BusinessModule,
    CampaignModule,
    MessageModule,
    StatusModule,
  ],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
