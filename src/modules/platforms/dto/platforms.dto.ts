import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsArray, IsIn, MinLength, MaxLength, Matches } from 'class-validator';

export class ConnectWhatsAppDto {
  @ApiProperty({
    description: 'Unique session name (alphanumeric and hyphens)',
    example: 'client-101-wa',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9-]+$/, { message: 'name can only contain letters, numbers, and hyphens' })
  name: string;

  @ApiProperty({ description: 'Meta Graph API permanent system-user access token', example: 'EAAx...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  accessToken: string;

  @ApiProperty({ description: 'WhatsApp phone number ID from Meta Business Manager', example: '123456789012345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phoneNumberId: string;

  @ApiPropertyOptional({ description: 'WhatsApp Business Account ID', example: '987654321098765' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  wabaId?: string;

  @ApiPropertyOptional({ description: 'Meta App Secret for webhook signature verification' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  appSecret?: string;

  @ApiPropertyOptional({ description: 'Webhook verify token for this number' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  verifyToken?: string;

  @ApiPropertyOptional({ description: 'Graph API version', example: 'v21.0', default: 'v21.0' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  graphApiVersion?: string;
}

export class ConnectGoogleDto {
  @ApiProperty({
    description: 'Google services to authorize',
    example: ['business', 'gmail'],
    enum: ['business', 'gmail', 'calendar', 'sheets', 'drive', 'youtube'],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(['business', 'gmail', 'calendar', 'sheets', 'drive', 'youtube'], { each: true })
  services: string[];
}

export class DisconnectPlatformDto {
  @ApiProperty({
    description: 'Platform to disconnect',
    enum: ['whatsapp', 'instagram', 'facebook', 'telegram', 'google'],
  })
  @IsIn(['whatsapp', 'instagram', 'facebook', 'telegram', 'google'])
  platform: string;
}
