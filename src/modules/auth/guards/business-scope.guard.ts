import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { ApiKeyRole } from '../entities/api-key.entity';
import { createLogger } from '../../../common/services/logger.service';

const REQUIRE_ACTIVE_BUSINESS_KEY = 'requireActiveBusiness';

export function RequireActiveBusiness(): ClassDecorator & MethodDecorator {
  return (target: object, _propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(REQUIRE_ACTIVE_BUSINESS_KEY, true, descriptor.value as object);
    } else {
      Reflect.defineMetadata(REQUIRE_ACTIVE_BUSINESS_KEY, true, target);
    }
  };
}

@Injectable()
export class BusinessScopeGuard implements CanActivate {
  private readonly logger = createLogger('BusinessScopeGuard');

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Business, 'data')
    private readonly businessRepo: Repository<Business>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireActive = this.reflector.getAllAndOverride<boolean>(REQUIRE_ACTIVE_BUSINESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requireActive) return true;

    const request = context.switchToHttp().getRequest<{ apiKey?: { businessId?: string; role?: string } }>();
    const businessId = request.apiKey?.businessId;

    if (!businessId) {
      if (request.apiKey?.role === ApiKeyRole.ADMIN) {
        return true;
      }
      throw new ForbiddenException('Business context required for this operation');
    }

    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      select: { id: true, isActive: true },
    });

    if (!business) {
      this.logger.warn(`Business not found: ${businessId}`);
      throw new ForbiddenException('Business not found');
    }

    if (!business.isActive) {
      throw new ForbiddenException('Business is deactivated');
    }

    return true;
  }
}
