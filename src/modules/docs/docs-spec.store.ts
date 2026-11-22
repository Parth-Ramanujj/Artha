import { Injectable } from '@nestjs/common';

/** Holds the full OpenAPI document; main.ts sets it once Swagger is built. Empty when Swagger is off. */
@Injectable()
export class DocsSpecStore {
  document: { paths: Record<string, unknown> } | null = null;
}
