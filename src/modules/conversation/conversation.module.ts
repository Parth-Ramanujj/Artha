import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Contact } from './entities/contact.entity';
import { ConversationService } from './conversation.service';
import { ConversationController, ContactController } from './conversation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Contact], 'data')],
  controllers: [ConversationController, ContactController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
