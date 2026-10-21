import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** A product the business sells — the single source of name, price, image and stock for messages. */
@Entity('studio_products')
@Index(['businessId', 'sku'])
export class StudioProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sku: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;

  @Column({ type: 'float', default: 0 })
  price: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  imageUrl: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  productUrl: string | null;

  @Column({ type: 'boolean', default: true })
  inStock: boolean;

  /** The product's content id in the Meta commerce catalog (needed for native product messages). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  retailerId: string | null;

  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
