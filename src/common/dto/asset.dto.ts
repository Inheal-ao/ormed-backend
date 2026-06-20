import { IsOptional, IsString } from 'class-validator';

export class AssetDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  publicId?: string;
}
