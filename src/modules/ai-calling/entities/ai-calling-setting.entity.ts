import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Server-wide AI calling settings that change at runtime, such as the tunnel's public URL. */
@Entity('ai_calling_settings')
export class AiCallingSetting {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
