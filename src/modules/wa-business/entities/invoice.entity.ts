import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export interface InvoiceItem {
  name: string;
  qty: number;
  /** Price per unit before GST, in rupees. */
  price: number;
}

/** A simple GST invoice / receipt sent to a customer on WhatsApp as a PDF. */
@Entity('wa_invoices')
@Index('IDX_wa_invoices_business_created', ['businessId', 'createdAt'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  businessId: string;

  @Column({ type: 'varchar', length: 64 })
  sessionId: string;

  /** INV-0001, per business. */
  @Column({ type: 'varchar', length: 32 })
  number: string;

  @Column({ type: 'varchar', length: 120 })
  sellerName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sellerGstin: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  sellerAddress: string | null;

  @Column({ type: 'varchar', length: 120 })
  customerName: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: jsonColumnType() })
  items: InvoiceItem[];

  @Column({ type: 'float', default: 0 })
  gstPercent: number;

  /** Grand total incl. GST, in paise (integers, so sums never drift). */
  @Column({ type: 'int' })
  totalPaise: number;

  /** paid | unpaid */
  @Column({ type: 'varchar', length: 10, default: 'paid' })
  status: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  sendError: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
