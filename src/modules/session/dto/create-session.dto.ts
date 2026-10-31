import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
  IsIn,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ToStrictBoolean } from '../../../common/utils/strict-boolean';

export class CloudApiConfigDto {
  @ApiPropertyOptional({ description: 'Meta Graph API access token for this session', example: 'EAAx...' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp phone number ID from Meta Business Manager',
    example: '123456789012345',
  })
  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @ApiPropertyOptional({ description: 'WhatsApp Business Account ID', example: '987654321098765' })
  @IsOptional()
  @IsString()
  wabaId?: string;

  @ApiPropertyOptional({ description: 'Webhook verify token for this session' })
  @IsOptional()
  @IsString()
  verifyToken?: string;

  @ApiPropertyOptional({ description: 'Meta App Secret for webhook signature verification' })
  @IsOptional()
  @IsString()
  appSecret?: string;

  @ApiPropertyOptional({ description: 'Meta App ID for token exchange' })
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional({ description: 'Graph API version', example: 'v21.0', default: 'v21.0' })
  @IsOptional()
  @IsString()
  graphApiVersion?: string;
}

export class SessionConfigDto {
  @ApiPropertyOptional({
    description: 'Per-session Cloud API credentials (overrides global env vars)',
    type: CloudApiConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CloudApiConfigDto)
  cloudApi?: CloudApiConfigDto;

  @ApiPropertyOptional({ description: 'Auto-reject incoming calls', default: false })
  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  autoRejectCalls?: boolean;
}

export class CreateSessionDto {
  @ApiProperty({
    description: 'Unique name for the session (alphanumeric and hyphens only)',
    example: 'my-bot',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Session name can only contain letters, numbers, and hyphens',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'WhatsApp engine to use for this session. When omitted, falls back to the global ENGINE_TYPE setting.',
    enum: ['whatsapp-web.js', 'baileys', 'cloud-api'],
    example: 'baileys',
  })
  @IsOptional()
  @IsIn(['whatsapp-web.js', 'baileys', 'cloud-api'])
  engineType?: 'whatsapp-web.js' | 'baileys' | 'cloud-api';

  @ApiPropertyOptional({
    description:
      'Session configuration. Includes per-session Cloud API credentials (config.cloudApi) ' +
      'that override global env vars, and autoRejectCalls (boolean, default false).',
    example: { cloudApi: { accessToken: 'EAAx...', phoneNumberId: '123456789012345' } },
    type: SessionConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionConfigDto)
  config?: SessionConfigDto;

  // Phase 3: Proxy per session
  @ApiPropertyOptional({
    description:
      'Optional per-session egress proxy URL (http/https/socks4/socks5; credentialed form ' +
      '"http://user:pass@host" allowed). Must be a REAL, REACHABLE proxy — an unreachable value ' +
      'silently blocks the WhatsApp WebSocket (no QR is ever delivered) and the session start times ' +
      'out (~30s → 504 Gateway Timeout). Leave unset unless your network cannot reach WhatsApp directly.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  // Reject a malformed/non-proxy URL at the boundary (credentialed http://user:pass@host and
  // socks4/5 still validate). The host is intentionally NOT SSRF-blocked here — a per-session proxy
  // is operator-chosen egress, and a loopback proxy sidecar is a legitimate setup.
  // require_tld:false + allow_underscores:true so single-label container hostnames (e.g. `squid`,
  // `localhost`) and IP-literal proxies validate, matching the engine's URL-parse check.
  @IsUrl(
    {
      protocols: ['http', 'https', 'socks4', 'socks5'],
      require_protocol: true,
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'proxyUrl must be a valid http(s)/socks4/socks5 URL' },
  )
  proxyUrl?: string;

  @ApiPropertyOptional({
    description: 'Proxy type',
    enum: ['http', 'https', 'socks4', 'socks5'],
    example: 'http',
  })
  @IsOptional()
  @IsIn(['http', 'https', 'socks4', 'socks5'])
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
}
