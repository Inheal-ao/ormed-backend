import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { BaseCrudService } from '../../common/base-crud.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slug.util';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type JobDocument = HydratedDocument<Job>;

/** Vaga de emprego publicada pela Ordem. */
@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true, trim: true }) title: string; // cargo
  @Prop({ required: true, unique: true, trim: true, index: true }) slug: string;
  @Prop({ default: '', trim: true }) entity: string; // instituição/empregador
  @Prop({ default: '', trim: true }) location: string;
  @Prop({ default: '', trim: true }) type: string; // ex.: Tempo inteiro, Contrato
  @Prop({ default: '' }) description: string;
  @Prop({ default: '' }) requirements: string;
  @Prop({ type: Date, default: null }) deadline: Date | null; // prazo de candidatura
  @Prop({ default: '', trim: true }) applicationEmail: string;
  @Prop({ default: '', trim: true }) externalLink: string;
  @Prop({ default: false, index: true }) isPublished: boolean;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}
export const JobSchema = SchemaFactory.createForClass(Job);

class CreateJobDto {
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() requirements?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsString() applicationEmail?: string;
  @IsOptional() @IsString() externalLink?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateJobDto extends PartialType(CreateJobDto) {}

@Injectable()
export class JobsService extends BaseCrudService<JobDocument> {
  constructor(@InjectModel(Job.name) jobModel: Model<JobDocument>) {
    super(jobModel, ['title', 'entity', 'location', 'type']);
  }
  async createOne(dto: CreateJobDto) {
    const slug = await this.uniqueSlug(dto.slug || slugify(dto.title));
    const publishedAt = dto.isPublished ? new Date() : null;
    return this.create({ ...dto, slug, publishedAt } as any);
  }
  async updateOne(id: string, dto: UpdateJobDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) patch.slug = await this.uniqueSlug(dto.slug || slugify(dto.title as string), id);
    if (dto.isPublished !== undefined) { const c = await this.findOne(id); patch.publishedAt = dto.isPublished ? c.publishedAt ?? new Date() : null; }
    return this.update(id, patch);
  }
  findPublished(p: PaginationDto) { return this.findAllPaginated(p, { isPublished: true }); }
  findPublishedBySlug(slug: string) { return this.findOneBy({ slug, isPublished: true }); }
  private async uniqueSlug(base: string, excludeId?: string) {
    let slug = base || 'vaga'; let i = 1;
    while (true) { const e = await this.model.findOne({ slug }).exec(); if (!e || e.id === excludeId) break; slug = `${base}-${i++}`; }
    return slug;
  }
}

@Controller('jobs')
export class JobsController {
  constructor(private readonly s: JobsService) {}
  @Public() @Get() pub(@Query() p: PaginationDto) { return this.s.findPublished(p); }
  @Public() @Get('slug/:slug') bySlug(@Param('slug') slug: string) { return this.s.findPublishedBySlug(slug); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all(@Query() p: PaginationDto) { return this.s.findAllPaginated(p); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateJobDto) { return this.s.createOne(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateJobDto) { return this.s.updateOne(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }])],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
