import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ApiKey } from './entities/api-key.entity';
import { Session } from '../session/entities/session.entity';
import { Business } from '../business/entities/business.entity';
import { AuthService } from './auth.service';
import { ApiKeyUsageTracker } from './api-key-usage-tracker.service';
import { AuthController } from './auth.controller';
import { AuthValidateController } from './auth-validate.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { BusinessScopeGuard } from './guards/business-scope.guard';
import { ProxyAwareThrottlerGuard } from '../../common/security/proxy-aware-throttler.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiKey], 'main'), TypeOrmModule.forFeature([Session, Business], 'data')],
  controllers: [AuthController, AuthValidateController],
  providers: [
    AuthService,
    ApiKeyUsageTracker,
    {
      provide: APP_GUARD,
      useClass: ProxyAwareThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BusinessScopeGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
