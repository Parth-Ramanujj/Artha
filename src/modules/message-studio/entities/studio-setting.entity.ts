import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

/** Per-business Message Studio settings. */
@Entity('studio_settings')
export class StudioSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** Meta commerce catalog connected to the WhatsApp Business account (for product messages). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  metaCatalogId: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
