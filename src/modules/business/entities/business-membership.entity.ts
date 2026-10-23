import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Business } from './business.entity';

export enum BusinessRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  AGENT = 'agent',
  VIEWER = 'viewer',
}

@Entity('business_memberships')
@Unique('UQ_business_memberships_business_key', ['businessId', 'apiKeyId'])
export class BusinessMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // No length: the join column below takes Business.id's uuid type, and Postgres rejects length on uuid.
  @Column({ type: 'varchar' })
  businessId: string;

  @Index()
  @Column({ type: 'varchar', length: 36, unique: true })
  apiKeyId: string;

  @Column({ type: 'varchar', length: 20, default: BusinessRole.AGENT })
  businessRole: BusinessRole;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
