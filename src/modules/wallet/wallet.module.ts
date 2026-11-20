import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../session/entities/session.entity';
import { Business } from '../business/entities/business.entity';
import { Notification } from '../conversation/entities/notification.entity';
import { BusinessModule } from '../business/business.module';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WalletSettings } from './entities/wallet-settings.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

/** Customer wallets. Imported by message costs, campaigns and studio, so it imports none of them. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletTransaction, WalletSettings, Session, Business, Notification], 'data'),
    BusinessModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
