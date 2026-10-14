import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

@Entity('contact_segments')
export class ContactSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  filters: Record<string, unknown> | null;

  @Column({ type: jsonColumnType(), nullable: true })
  staticContactIds: string[] | null;

  @Column({ type: 'varchar', length: 20, default: 'dynamic' })
  type: 'dynamic' | 'static';

  @Column({ type: 'integer', default: 0 })
  contactCount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
