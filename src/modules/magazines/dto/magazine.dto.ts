import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { AssetDto } from '../../../common/dto/asset.dto';

export class CreateMagazineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1980)
  @Max(2100)
  year?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssetDto)
  coverImage?: AssetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssetDto)
  pdf?: AssetDto;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateMagazineDto extends PartialType(CreateMagazineDto) {}
