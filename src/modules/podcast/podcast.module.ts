import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { AssetDto } from '../../common/dto/asset.dto';
import { BaseCrudService } from '../../common/base-crud.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slug.util';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type PodcastDocument = HydratedDocument<PodcastEpisode>;

@Schema({ timestamps: true })
export class PodcastEpisode {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, unique: true, trim: true, index: true }) slug: string;
  @Prop({ default: '', trim: true }) episode: string; // ex.: "Episódio #12"
  @Prop({ default: '', trim: true }) description: string;
  @Prop({ required: true, trim: true }) youtubeUrl: string;
  @Prop({ type: AssetSchema, default: null }) coverImage: Asset | null; // miniatura opcional
  @Prop({ default: false, index: true }) isPublished: boolean;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}
export const PodcastSchema = SchemaFactory.createForClass(PodcastEpisode);

class CreatePodcastDto {
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() episode?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsUrl({}, { message: 'Link do YouTube inválido.' }) youtubeUrl: string;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) coverImage?: AssetDto;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdatePodcastDto extends PartialType(CreatePodcastDto) {}

@Injectable()
export class PodcastService extends BaseCrudService<PodcastDocument> {
  constructor(@InjectModel(PodcastEpisode.name) podcastModel: Model<PodcastDocument>) {
    super(podcastModel, ['title', 'description', 'episode']);
  }
  async createOne(dto: CreatePodcastDto) {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    return this.create({ ...dto, slug, publishedAt: dto.isPublished ? new Date() : null } as any);
  }
  async updateOne(id: string, dto: UpdatePodcastDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) patch.slug = await this.uniqueSlug(dto.slug || slugify(dto.title as string), id);
    if (dto.isPublished !== undefined) { const c = await this.findOne(id); patch.publishedAt = dto.isPublished ? c.publishedAt ?? new Date() : null; }
    return this.update(id, patch);
  }
  findPublished(p: PaginationDto) { return this.findAllPaginated(p, { isPublished: true }); }
  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'episodio'; let i = 1;
    while (true) { const e = await this.model.findOne({ slug }).exec(); if (!e || e.id === excludeId) break; slug = `${base}-${i++}`; }
    return slug;
  }
}

@Controller('podcast')
export class PodcastController {
  constructor(private readonly s: PodcastService) {}
  @Public() @Get() pub(@Query() p: PaginationDto) { return this.s.findPublished(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all(@Query() p: PaginationDto) { return this.s.findAllPaginated(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreatePodcastDto) { return this.s.createOne(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdatePodcastDto) { return this.s.updateOne(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: PodcastEpisode.name, schema: PodcastSchema }])],
  controllers: [PodcastController],
  providers: [PodcastService],
})
export class PodcastModule {}
