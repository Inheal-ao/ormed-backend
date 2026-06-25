import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body,
} from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type HeroSlideDocument = HydratedDocument<HeroSlide>;

/** Slide do hero da página inicial (imagem + textos + botões). */
@Schema({ timestamps: true })
export class HeroSlide {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '', trim: true }) subtitle: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: AssetSchema, default: null }) image: Asset | null;
  @Prop({ default: '', trim: true }) ctaLabel: string;
  @Prop({ default: '', trim: true }) ctaHref: string;
  @Prop({ default: '', trim: true }) cta2Label: string;
  @Prop({ default: '', trim: true }) cta2Href: string;
  @Prop({ default: 0, index: true }) order: number;
  @Prop({ default: true }) isPublished: boolean;
}
export const HeroSlideSchema = SchemaFactory.createForClass(HeroSlide);

class CreateHeroDto {
  @IsString() @MaxLength(150) title: string;
  @IsOptional() @IsString() @MaxLength(150) subtitle?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsObject() image?: Asset | null;
  @IsOptional() @IsString() @MaxLength(80) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(200) ctaHref?: string;
  @IsOptional() @IsString() @MaxLength(80) cta2Label?: string;
  @IsOptional() @IsString() @MaxLength(200) cta2Href?: string;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateHeroDto extends PartialType(CreateHeroDto) {}

@Injectable()
export class HeroService {
  constructor(@InjectModel(HeroSlide.name) private readonly model: Model<HeroSlideDocument>) {}

  findPublished() { return this.model.find({ isPublished: true }).sort({ order: 1, createdAt: 1 }).exec(); }
  findAllOrdered() { return this.model.find().sort({ order: 1, createdAt: 1 }).exec(); }
  create(dto: CreateHeroDto) { return this.model.create(dto); }
  update(id: string, dto: UpdateHeroDto) { return this.model.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  async remove(id: string) { await this.model.findByIdAndDelete(id).exec(); return { ok: true }; }
}

@Controller('hero')
export class HeroController {
  constructor(private readonly service: HeroService) {}

  @Public() @Get()
  findPublished() { return this.service.findPublished(); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  findAll() { return this.service.findAllOrdered(); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreateHeroDto) { return this.service.create(dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHeroDto) { return this.service.update(id, dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: HeroSlide.name, schema: HeroSlideSchema }])],
  controllers: [HeroController],
  providers: [HeroService],
  exports: [HeroService],
})
export class HeroModule {}
