import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { AssetDto } from '../../../common/dto/asset.dto';

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssetDto)
  coverImage?: AssetDto;

  @IsOptional()
  @IsString()
  location?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}
