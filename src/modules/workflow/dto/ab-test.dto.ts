import { IsString, IsOptional, IsArray, IsInt, Min, ValidateNested, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

class VariantDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  weight: number;

  @IsObject()
  content: Record<string, unknown>;
}

export class CreateAbTestDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];

  @IsOptional()
  @IsInt()
  @Min(10)
  sampleSize?: number;
}

export class UpdateAbTestDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  @IsOptional()
  @IsInt()
  @Min(10)
  sampleSize?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
