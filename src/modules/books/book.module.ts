import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

export type BookDocument = HydratedDocument<Book>;

@Schema({ timestamps: true })
export class Book {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, unique: true, trim: true, index: true }) slug: string;
  @Prop({ default: '', trim: true }) author: string;
  @Prop({ default: '', trim: true }) description: string;
  @Prop({ type: Number }) year: number;
  @Prop({ type: AssetSchema, default: null }) coverImage: Asset | null;
  @Prop({ type: AssetSchema, default: null }) pdf: Asset | null; // opcional
  @Prop({ default: '', trim: true }) externalLink: string; // opcional (em vez do PDF)
  @Prop({ default: false, index: true }) isPublished: boolean;
}
export const BookSchema = SchemaFactory.createForClass(Book);

class CreateBookDto {
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() author?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() year?: number;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) coverImage?: AssetDto;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) pdf?: AssetDto;
  @IsOptional() @IsUrl({}, { message: 'Link externo inválido.' }) externalLink?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateBookDto extends PartialType(CreateBookDto) {}

@Injectable()
export class BooksService extends BaseCrudService<BookDocument> {
  constructor(@InjectModel(Book.name) bookModel: Model<BookDocument>) {
    super(bookModel, ['title', 'author', 'description']);
  }
  async createOne(dto: CreateBookDto) {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    return this.create({ ...dto, slug } as any);
  }
  async updateOne(id: string, dto: UpdateBookDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) patch.slug = await this.uniqueSlug(dto.slug || slugify(dto.title as string), id);
    return this.update(id, patch);
  }
  findPublished(p: PaginationDto) { return this.findAllPaginated(p, { isPublished: true }); }
  findPublishedBySlug(slug: string) { return this.findOneBy({ slug, isPublished: true }); }
  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'livro'; let i = 1;
    while (true) { const e = await this.model.findOne({ slug }).exec(); if (!e || e.id === excludeId) break; slug = `${base}-${i++}`; }
    return slug;
  }
}

@Controller('books')
export class BooksController {
  constructor(private readonly s: BooksService) {}
  @Public() @Get() pub(@Query() p: PaginationDto) { return this.s.findPublished(p); }
  @Public() @Get('slug/:slug') bySlug(@Param('slug') slug: string) { return this.s.findPublishedBySlug(slug); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all(@Query() p: PaginationDto) { return this.s.findAllPaginated(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateBookDto) { return this.s.createOne(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateBookDto) { return this.s.updateOne(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Book.name, schema: BookSchema }])],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}
