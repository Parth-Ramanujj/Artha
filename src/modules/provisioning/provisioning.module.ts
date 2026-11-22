import { Module } from '@nestjs/common';
import { ProvisioningController } from './provisioning.controller';
import { BusinessModule } from '../business/business.module';

/**
 * Tenant provisioning for partner apps.
 *
 * AuthModule is @Global, so AuthService is already available without an explicit import.
 * BusinessModule is imported for BusinessService.
 */
@Module({
  imports: [BusinessModule],
  controllers: [ProvisioningController],
})
export class ProvisioningModule {}
