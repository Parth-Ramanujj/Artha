import { IsString, IsOptional, IsDateString, IsIn, MaxLength, IsUUID } from 'class-validator';
import { ReminderStatus } from '../entities/reminder.entity';

export class CreateReminderDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsDateString()
  dueAt: string;

  @IsOptional()
  @IsUUID()
  dealId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn([ReminderStatus.OPEN, ReminderStatus.DONE])
  status?: ReminderStatus;
}
