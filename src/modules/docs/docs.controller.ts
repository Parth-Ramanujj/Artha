import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { filterOpenApiByFeatures } from './openapi-filter';
import { DocsSpecStore } from './docs-spec.store';

/** The API reference for ONE key: the Swagger page asks here with the key typed into it. */
@ApiExcludeController()
@RequireUnscopedKey()
@Controller('docs-spec')
export class DocsController {
  constructor(private readonly store: DocsSpecStore) {}

  @Get()
  @RequireRole(ApiKeyRole.VIEWER)
  get(@CurrentApiKey() apiKey?: ApiKey) {
    if (!this.store.document) return { paths: {} };
    return filterOpenApiByFeatures(this.store.document, apiKey?.allowedFeatures ?? null);
  }
}
