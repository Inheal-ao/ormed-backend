import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

export type BulletinDocument = HydratedDocument<Bulletin>;

@Schema({ timestamps: true })
export class Bulletin {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, unique: true, trim: true, index: true }) slug: string;
  @Prop({ default: '', trim: true }) description: string;
  @Prop({ default: '', trim: true }) edition: string;
  @Prop({ type: Number }) year: number;
  @Prop({ type: AssetSchema, default: null }) coverImage: Asset | null;
  // Boletim pode ter várias imagens (estilo galeria/comunicados)
  @Prop({ type: [AssetSchema], default: [] }) images: Asset[];
  @Prop({ type: AssetSchema, default: null }) pdf: Asset | null;
  // Vídeo (link do YouTube/Vimeo, opcional)
  @Prop({ default: '', trim: true }) videoUrl: string;
  @Prop({ default: false, index: true }) isPublished: boolean;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}
export const BulletinSchema = SchemaFactory.createForClass(Bulletin);

class CreateBulletinDto {
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() edition?: string;
  @IsOptional() @Type(() => Number) @IsInt() year?: number;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) coverImage?: AssetDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AssetDto) images?: AssetDto[];
  @IsOptional() @ValidateNested() @Type(() => AssetDto) pdf?: AssetDto;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateBulletinDto extends PartialType(CreateBulletinDto) {}

@Injectable()
export class BulletinsService extends BaseCrudService<BulletinDocument> {
  constructor(@InjectModel(Bulletin.name) bulletinModel: Model<BulletinDocument>) {
    super(bulletinModel, ['title', 'description', 'edition']);
  }
  async createOne(dto: CreateBulletinDto) {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    return this.create({ ...dto, slug, publishedAt: dto.isPublished ? new Date() : null } as any);
  }
  async updateOne(id: string, dto: UpdateBulletinDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) patch.slug = await this.uniqueSlug(dto.slug || slugify(dto.title as string), id);
    if (dto.isPublished !== undefined) { const c = await this.findOne(id); patch.publishedAt = dto.isPublished ? c.publishedAt ?? new Date() : null; }
    return this.update(id, patch);
  }
  findPublished(p: PaginationDto) { return this.findAllPaginated(p, { isPublished: true }); }
  findPublishedBySlug(slug: string) { return this.findOneBy({ slug, isPublished: true }); }
  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'boletim'; let i = 1;
    while (true) { const e = await this.model.findOne({ slug }).exec(); if (!e || e.id === excludeId) break; slug = `${base}-${i++}`; }
    return slug;
  }
}

@Controller('bulletins')
export class BulletinsController {
  constructor(private readonly s: BulletinsService) {}
  @Public() @Get() pub(@Query() p: PaginationDto) { return this.s.findPublished(p); }
  @Public() @Get('slug/:slug') bySlug(@Param('slug') slug: string) { return this.s.findPublishedBySlug(slug); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all(@Query() p: PaginationDto) { return this.s.findAllPaginated(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateBulletinDto) { return this.s.createOne(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateBulletinDto) { return this.s.updateOne(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Bulletin.name, schema: BulletinSchema }])],
  controllers: [BulletinsController],
  providers: [BulletinsService],
})
export class BulletinsModule {}
