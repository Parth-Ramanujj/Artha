import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

@Entity('contacts')
@Unique('UQ_contacts_business_wa', ['businessId', 'waContactId'])
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  waContactId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  tags: string[] | null;

  @Column({ type: jsonColumnType(), nullable: true })
  metadata: Record<string, unknown> | null;

  /** MM-DD, so "whose birthday is today" is a plain equality query. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  birthday: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  anniversary: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
