import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

export type ArticleDocument = HydratedDocument<Article>;

/** Artigo da Revista Médica (RevMed): pesquisa ou resumo publicado por médicos. */
@Schema({ timestamps: true })
export class Article {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, unique: true, trim: true, index: true }) slug: string;
  @Prop({ default: '', trim: true }) subtitle: string;
  @Prop({ default: '', trim: true }) authors: string; // ex.: "Dr. João Silva, Dra. Maria Costa"
  @Prop({ default: '', trim: true }) affiliation: string; // instituição
  @Prop({ default: '', trim: true }) category: string; // área/especialidade
  @Prop({ default: '' }) abstract: string; // resumo
  @Prop({ default: '' }) content: string; // texto completo/alargado
  @Prop({ type: [String], default: [] }) keywords: string[];
  @Prop({ type: AssetSchema, default: null }) coverImage: Asset | null;
  @Prop({ type: AssetSchema, default: null }) pdf: Asset | null; // artigo completo
  @Prop({ default: '', trim: true }) externalLink: string; // pesquisa publicada noutra revista
  @Prop({ default: '', trim: true }) doi: string;
  @Prop({ default: false, index: true }) isPublished: boolean;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}
export const ArticleSchema = SchemaFactory.createForClass(Article);

class CreateArticleDto {
  @IsString() @MinLength(3) @MaxLength(300) title: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() @MaxLength(400) subtitle?: string;
  @IsOptional() @IsString() @MaxLength(500) authors?: string;
  @IsOptional() @IsString() @MaxLength(400) affiliation?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() abstract?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
  @IsOptional() @ValidateNested() @Type(() => AssetDto) coverImage?: AssetDto;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) pdf?: AssetDto;
  @IsOptional() @IsUrl({}, { message: 'Link externo inválido.' }) externalLink?: string;
  @IsOptional() @IsString() doi?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateArticleDto extends PartialType(CreateArticleDto) {}

@Injectable()
export class RevMedService extends BaseCrudService<ArticleDocument> {
  constructor(@InjectModel(Article.name) articleModel: Model<ArticleDocument>) {
    super(articleModel, ['title', 'authors', 'abstract', 'category', 'keywords']);
  }
  async createOne(dto: CreateArticleDto) {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    const publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : dto.isPublished ? new Date() : null;
    return this.create({ ...dto, slug, publishedAt } as any);
  }
  async updateOne(id: string, dto: UpdateArticleDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) patch.slug = await this.uniqueSlug(dto.slug || slugify(dto.title as string), id);
    if (dto.publishedAt) patch.publishedAt = new Date(dto.publishedAt);
    else if (dto.isPublished !== undefined) { const c = await this.findOne(id); patch.publishedAt = dto.isPublished ? c.publishedAt ?? new Date() : null; }
    return this.update(id, patch);
  }
  findPublished(p: PaginationDto) { return this.findAllPaginated(p, { isPublished: true }); }
  findPublishedBySlug(slug: string) { return this.findOneBy({ slug, isPublished: true }); }
  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'artigo'; let i = 1;
    while (true) { const e = await this.model.findOne({ slug }).exec(); if (!e || e.id === excludeId) break; slug = `${base}-${i++}`; }
    return slug;
  }
}

@Controller('revmed')
export class RevMedController {
  constructor(private readonly s: RevMedService) {}
  @Public() @Get() pub(@Query() p: PaginationDto) { return this.s.findPublished(p); }
  @Public() @Get('slug/:slug') bySlug(@Param('slug') slug: string) { return this.s.findPublishedBySlug(slug); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all(@Query() p: PaginationDto) { return this.s.findAllPaginated(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateArticleDto) { return this.s.createOne(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateArticleDto) { return this.s.updateOne(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Article.name, schema: ArticleSchema }])],
  controllers: [RevMedController],
  providers: [RevMedService],
})
export class RevMedModule {}
