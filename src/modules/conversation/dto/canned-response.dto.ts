import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateCannedResponseDto {
  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(50)
  shortcut: string;

  @IsString()
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortcut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}
