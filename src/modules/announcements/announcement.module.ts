import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsArray, IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

export type AnnouncementDocument = HydratedDocument<Announcement>;

/** Comunicado oficial da Ordem. */
@Schema({ timestamps: true })
export class Announcement {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, unique: true, trim: true, index: true }) slug: string;
  @Prop({ default: 'Geral', trim: true }) category: string;
  @Prop({ default: '' }) content: string;
  @Prop({ type: AssetSchema, default: null }) coverImage: Asset | null;
  // Documentos partilhados como imagens (estilo galeria)
  @Prop({ type: [AssetSchema], default: [] }) images: Asset[];
  @Prop({ type: AssetSchema, default: null }) pdf: Asset | null; // opcional
  @Prop({ default: false, index: true }) isPublished: boolean;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}
export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

class CreateAnnouncementDto {
  @IsString() @MinLength(3) @MaxLength(250) title: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) coverImage?: AssetDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AssetDto) images?: AssetDto[];
  @IsOptional() @ValidateNested() @Type(() => AssetDto) pdf?: AssetDto;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

@Injectable()
export class AnnouncementsService extends BaseCrudService<AnnouncementDocument> {
  constructor(@InjectModel(Announcement.name) announcementModel: Model<AnnouncementDocument>) {
    super(announcementModel, ['title', 'content', 'category']);
  }
  async createOne(dto: CreateAnnouncementDto) {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    const publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : dto.isPublished ? new Date() : null;
    return this.create({ ...dto, slug, publishedAt } as any);
  }
  async updateOne(id: string, dto: UpdateAnnouncementDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) patch.slug = await this.uniqueSlug(dto.slug || slugify(dto.title as string), id);
    if (dto.publishedAt) patch.publishedAt = new Date(dto.publishedAt);
    else if (dto.isPublished !== undefined) { const c = await this.findOne(id); patch.publishedAt = dto.isPublished ? c.publishedAt ?? new Date() : null; }
    return this.update(id, patch);
  }
  findPublished(p: PaginationDto) { return this.findAllPaginated(p, { isPublished: true }); }
  findPublishedBySlug(slug: string) { return this.findOneBy({ slug, isPublished: true }); }
  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'comunicado'; let i = 1;
    while (true) { const e = await this.model.findOne({ slug }).exec(); if (!e || e.id === excludeId) break; slug = `${base}-${i++}`; }
    return slug;
  }
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly s: AnnouncementsService) {}
  @Public() @Get() pub(@Query() p: PaginationDto) { return this.s.findPublished(p); }
  @Public() @Get('slug/:slug') bySlug(@Param('slug') slug: string) { return this.s.findPublishedBySlug(slug); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all(@Query() p: PaginationDto) { return this.s.findAllPaginated(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateAnnouncementDto) { return this.s.createOne(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) { return this.s.updateOne(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Announcement.name, schema: AnnouncementSchema }])],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
