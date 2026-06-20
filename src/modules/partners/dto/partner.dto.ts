import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { AssetDto } from '../../../common/dto/asset.dto';

export class CreatePartnerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssetDto)
  logo?: AssetDto;

  @IsOptional()
  @IsUrl({}, { message: 'Website inválido.' })
  website?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}
