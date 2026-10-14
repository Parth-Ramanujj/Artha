import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  @MaxLength(40)
  type: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  recipientId?: string;
}
