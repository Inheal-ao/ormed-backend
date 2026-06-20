import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateStatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  value: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateStatDto extends PartialType(CreateStatDto) {}
