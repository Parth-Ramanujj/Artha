import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export enum AssignmentStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_ACTIVE = 'least_active',
  MANUAL = 'manual',
}

@Entity('assignment_rules')
export class AssignmentRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 30, default: AssignmentStrategy.ROUND_ROBIN })
  strategy: AssignmentStrategy;

  @Column({ type: jsonColumnType(), nullable: true })
  agents: string[] | null;

  @Column({ type: jsonColumnType(), nullable: true })
  conditions: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @Column({ type: 'integer', default: 0 })
  lastAssignedIndex: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
