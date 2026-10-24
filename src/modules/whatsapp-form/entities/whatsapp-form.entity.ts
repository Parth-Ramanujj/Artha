import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import type { FormDefinition, FlowCategory } from '../flow-definition';

export type WhatsAppFormStatus = 'draft' | 'published';

/**
 * A WhatsApp Form: the builder's definition, plus the Meta Flow it was last published as.
 * Meta flows are immutable once published, so a republish creates a new one (see the service).
 */
@Entity('whatsapp_forms')
@Index(['businessId'])
export class WhatsAppForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 40, default: 'OTHER' })
  category: FlowCategory;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: WhatsAppFormStatus;

  @Column({ type: jsonColumnType() })
  definition: FormDefinition;

  /** Meta flow id of the latest publish attempt. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  metaFlowId: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
