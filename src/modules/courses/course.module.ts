import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

export type CourseDocument = HydratedDocument<Course>;

/** Curso / formação contínua (semelhante a evento, com cartaz). */
@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, unique: true, trim: true, index: true }) slug: string;
  @Prop({ default: '', trim: true }) description: string;
  @Prop({ default: '' }) content: string;
  @Prop({ type: AssetSchema, default: null }) coverImage: Asset | null; // cartaz
  @Prop({ default: '', trim: true }) instructor: string; // formador
  @Prop({ default: '', trim: true }) area: string; // área/especialidade
  @Prop({ default: 'presencial', enum: ['presencial', 'online', 'misto'] }) modality: string;
  @Prop({ default: '', trim: true }) duration: string; // ex.: "3 dias", "20 horas"
  @Prop({ default: '', trim: true }) location: string;
  @Prop({ type: Date, default: null, index: true }) startDate: Date | null;
  @Prop({ default: 0 }) capacity: number;
  @Prop({ default: 0 }) price: number;
  @Prop({ default: true }) registrationOpen: boolean;
  @Prop({ default: 'internal', enum: ['internal', 'external'] }) registrationType: string;
  @Prop({ default: '', trim: true }) externalLink: string;
  @Prop({ default: false, index: true }) isPublished: boolean;
}
export const CourseSchema = SchemaFactory.createForClass(Course);

class CreateCourseDto {
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) coverImage?: AssetDto;
  @IsOptional() @IsString() instructor?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsIn(['presencial', 'online', 'misto']) modality?: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capacity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @IsBoolean() registrationOpen?: boolean;
  @IsOptional() @IsIn(['internal', 'external']) registrationType?: string;
  @IsOptional() @IsString() externalLink?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateCourseDto extends PartialType(CreateCourseDto) {}

@Injectable()
export class CoursesService extends BaseCrudService<CourseDocument> {
  constructor(@InjectModel(Course.name) courseModel: Model<CourseDocument>) {
    super(courseModel, ['title', 'description', 'instructor', 'area']);
  }
  async createOne(dto: CreateCourseDto) {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    return this.create({ ...dto, slug } as any);
  }
  async updateOne(id: string, dto: UpdateCourseDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) patch.slug = await this.uniqueSlug(dto.slug || slugify(dto.title as string), id);
    return this.update(id, patch);
  }
  findPublished(p: PaginationDto) { return this.findAllPaginated(p, { isPublished: true }); }
  findPublishedBySlug(slug: string) { return this.findOneBy({ slug, isPublished: true }); }
  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'curso'; let i = 1;
    while (true) { const e = await this.model.findOne({ slug }).exec(); if (!e || e.id === excludeId) break; slug = `${base}-${i++}`; }
    return slug;
  }
}

@Controller('courses')
export class CoursesController {
  constructor(private readonly s: CoursesService) {}
  @Public() @Get() pub(@Query() p: PaginationDto) { return this.s.findPublished(p); }
  @Public() @Get('slug/:slug') bySlug(@Param('slug') slug: string) { return this.s.findPublishedBySlug(slug); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all(@Query() p: PaginationDto) { return this.s.findAllPaginated(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateCourseDto) { return this.s.createOne(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateCourseDto) { return this.s.updateOne(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }])],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
