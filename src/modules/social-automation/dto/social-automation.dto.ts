import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';
import type { RuleMatchType, SocialMediaType, SocialPlatform } from '../entities/social-automation.entity';

const PLATFORMS = ['instagram', 'facebook'] as const;
const MEDIA_TYPES = ['IMAGE', 'VIDEO'] as const;
const META_ID = /^\d{5,30}$/;
const httpsUrl = { protocols: ['https'], require_protocol: true };

export class CreateSocialAccountDto {
  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform: SocialPlatform;

  @ApiPropertyOptional({ example: 'My Brand Instagram' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  accountName?: string;

  @ApiProperty({ example: '17841400000000000', description: 'Instagram Business account ID or Facebook Page ID' })
  @Matches(META_ID, { message: 'accountId must be the numeric Meta ID' })
  accountId: string;

  @ApiProperty({ description: 'Long-lived Page access token from Meta (never returned by the API)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  accessToken: string;

  @ApiPropertyOptional({ description: 'Facebook Page linked to the Instagram account (required for Instagram)' })
  @Matches(META_ID, { message: 'pageId must be the numeric Facebook Page ID' })
  @IsOptional()
  pageId?: string;

  @ApiPropertyOptional({ description: 'Webhook verify token to enter in the Meta app. Generated when empty.' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  webhookVerifyToken?: string;
}

export class UpdateSocialAccountDto extends PartialType(CreateSocialAccountDto) {
  @ApiPropertyOptional({ enum: ['connected', 'disconnected'] })
  @IsIn(['connected', 'disconnected'])
  @IsOptional()
  status?: 'connected' | 'disconnected';
}

export class CreateSocialPostDto {
  @ApiPropertyOptional({
    description: 'Connected account to publish with. Defaults to the first connected account of the platform.',
  })
  @IsUUID()
  @IsOptional()
  accountId?: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform: SocialPlatform;

  @ApiProperty({ example: 'Check out our new launch! #innovation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2200)
  caption: string;

  @ApiProperty({ description: 'Public HTTPS image or video URL that Meta can download' })
  @IsUrl(httpsUrl)
  @MaxLength(2000)
  mediaUrl: string;

  @ApiPropertyOptional({ enum: MEDIA_TYPES, default: 'IMAGE' })
  @IsIn(MEDIA_TYPES)
  @IsOptional()
  mediaType?: SocialMediaType;

  @ApiPropertyOptional({ description: 'ISO date-time to publish at. Empty saves a draft.' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Publish to Meta right away' })
  @ToStrictBoolean()
  @IsBoolean()
  @IsOptional()
  publishNow?: boolean;
}

export class UpdateSocialPostDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2200)
  @IsOptional()
  caption?: string;

  @ApiPropertyOptional()
  @IsUrl(httpsUrl)
  @MaxLength(2000)
  @IsOptional()
  mediaUrl?: string;

  @ApiPropertyOptional({ enum: MEDIA_TYPES })
  @IsIn(MEDIA_TYPES)
  @IsOptional()
  mediaType?: SocialMediaType;

  @ApiPropertyOptional({ description: 'ISO date-time, or null to unschedule' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string | null;

  @ApiPropertyOptional({ enum: ['draft', 'scheduled'] })
  @IsIn(['draft', 'scheduled'])
  @IsOptional()
  status?: 'draft' | 'scheduled';
}

export class CreateCommentRuleDto {
  @ApiProperty({ example: 'Price question' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ enum: ['all', ...PLATFORMS], default: 'all' })
  @IsIn(['all', ...PLATFORMS])
  @IsOptional()
  platform?: 'all' | SocialPlatform;

  @ApiPropertyOptional({ description: 'Only comments on this Meta post/media ID; empty for all posts' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  postId?: string;

  @ApiProperty({ enum: ['contains', 'exact', 'regex', 'all'], default: 'contains' })
  @IsIn(['contains', 'exact', 'regex', 'all'])
  matchType: RuleMatchType;

  @ApiProperty({ example: ['price', 'cost', 'how much'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  keywords: string[];

  @ApiProperty({
    example: ['Hi {username}! Sent you the price list in DM ✨'],
    description: 'Reply variations, one is picked at random',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  replyTemplates: string[];

  @ApiPropertyOptional({ default: false, description: 'Like the comment (Facebook only; Instagram has no API for it)' })
  @ToStrictBoolean()
  @IsBoolean()
  @IsOptional()
  autoLike?: boolean;

  @ApiPropertyOptional({ default: false })
  @ToStrictBoolean()
  @IsBoolean()
  @IsOptional()
  autoDm?: boolean;

  @ApiPropertyOptional({ example: 'Hi {username}! Here is our price list: https://example.com/pricing' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  autoDmTemplate?: string;

  @ApiPropertyOptional({ default: false, description: 'Write the reply with the configured AI provider' })
  @ToStrictBoolean()
  @IsBoolean()
  @IsOptional()
  useAi?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  aiPrompt?: string;

  @ApiPropertyOptional({ default: 3, description: 'Seconds to wait before replying (0-10)' })
  @ToStrictNumber()
  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  delaySeconds?: number;

  @ApiPropertyOptional({ default: true })
  @ToStrictBoolean()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateCommentRuleDto extends PartialType(CreateCommentRuleDto) {}

export class ToggleCommentRuleDto {
  @ApiProperty()
  @ToStrictBoolean()
  @IsBoolean()
  enabled: boolean;
}

export class SimulateCommentDto {
  @ApiProperty({ example: 'Hey, what is the price of this?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2200)
  commentText: string;

  @ApiPropertyOptional({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  @IsOptional()
  platform?: SocialPlatform;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  postId?: string;

  @ApiPropertyOptional({ example: 'john_doe' })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  fromUserName?: string;
}
