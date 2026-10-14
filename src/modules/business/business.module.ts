import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { Business } from './entities/business.entity';
import { BusinessMembership } from './entities/business-membership.entity';
import { ApiKey } from '../auth/entities/api-key.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Business, BusinessMembership], 'data'),
    TypeOrmModule.forFeature([ApiKey], 'main'),
  ],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
