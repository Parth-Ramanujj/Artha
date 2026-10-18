import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

@Entity('workflow_agents')
@Index(['businessId', 'isActive'])
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profileImage: string | null;

  @Column({ type: 'float', default: 4.8 })
  rating: number;

  @Column({ type: 'integer', default: 5 })
  experienceYears: number;

  @Column({ type: 'varchar', length: 200, default: 'Pan-India' })
  serviceArea: string;

  @Column({ type: jsonColumnType() })
  pincodes: string[]; // ['380001', '380015', '380*', '400*']

  @Column({ type: jsonColumnType() })
  supportedProducts: string[]; // ['life_insurance', 'health_insurance', 'motor_insurance', 'sme_insurance', 'mutual_fund', 'claim_support', 'audit']

  @Column({ type: jsonColumnType(), nullable: true })
  supportedCompanies: string[] | null; // ['HDFC Life', 'Star Health', 'ICICI Lombard', 'SBI Mutual Fund']

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'integer', default: 50 })
  leadCapacity: number;

  @Column({ type: 'integer', default: 0 })
  currentLeadsCount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  callLink: string | null; // 'tel:+919876543210'

  @Column({ type: 'varchar', length: 255, nullable: true })
  whatsappLink: string | null; // 'https://wa.me/919876543210'

  // No DateTransformer here: it maps an unset value to NULL, which bypasses the column DEFAULT and
  // fails the NOT NULL insert (agent seeding silently failed on SQLite).
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
