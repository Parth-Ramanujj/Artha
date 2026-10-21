import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export enum IntegrationType {
  CRM_ZOHO = 'crm_zoho',
  CRM_HUBSPOT = 'crm_hubspot',
  CRM_SALESFORCE = 'crm_salesforce',
  ECOM_SHOPIFY = 'ecom_shopify',
  ECOM_WOOCOMMERCE = 'ecom_woocommerce',
  CALENDAR_GOOGLE = 'calendar_google',
  EMAIL_SMTP = 'email_smtp',
  GOOGLE_GMAIL = 'google_gmail',
  GOOGLE_CALENDAR = 'google_calendar',
  GOOGLE_SHEETS = 'google_sheets',
  GOOGLE_DRIVE = 'google_drive',
}

export enum IntegrationStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  PENDING = 'pending',
}

@Entity('integrations')
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: IntegrationStatus.DISCONNECTED })
  status: string;

  @Column({ type: jsonColumnType(), nullable: true })
  config: Record<string, unknown> | null;

  @Column({ type: jsonColumnType(), nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
