import { Module } from '@nestjs/common';
import { DocsController } from './docs.controller';
import { DocsSpecStore } from './docs-spec.store';

@Module({ controllers: [DocsController], providers: [DocsSpecStore], exports: [DocsSpecStore] })
export class DocsModule {}
