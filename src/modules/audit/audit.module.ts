import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditTrailInterceptor } from './audit-trail.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog], 'main')],
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditTrailInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
