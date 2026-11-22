import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from '../business/business.module';
import { MessageModule } from '../message/message.module';
import { StudioProduct } from '../message-studio/entities/studio-product.entity';
import { Session } from '../session/entities/session.entity';
import { ShopifyCheckout, ShopifyStore } from './entities/shopify.entity';
import { ShopifyController, ShopifyWebhookController } from './shopify.controller';
import { ShopifyService } from './shopify.service';

/** Shopify store connection, product catalog sync and abandoned-cart WhatsApp reminders. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ShopifyStore, ShopifyCheckout, StudioProduct, Session], 'data'),
    BusinessModule,
    MessageModule,
  ],
  controllers: [ShopifyController, ShopifyWebhookController],
  providers: [ShopifyService],
})
export class CommerceModule {}
