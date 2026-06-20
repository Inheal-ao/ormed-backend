import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { AssetDto } from '../../common/dto/asset.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type DocItem = HydratedDocument<InstitutionalDocument>;

/** Documento institucional em PDF (estatutos, códigos, regulamentos, normas). */
@Schema({ timestamps: true })
export class InstitutionalDocument {
  @Prop({ required: true, trim: true }) title: string;
  // Categoria = a que página pertence (ex.: "estatutos", "codigo-deontologico")
  @Prop({ required: true, trim: true, index: true }) category: string;
  @Prop({ default: '', trim: true }) description: string;
  @Prop({ type: AssetSchema, default: null }) pdf: Asset | null;
  @Prop({ default: '', trim: true }) externalLink: string;
  @Prop({ default: 0, index: true }) order: number;
  @Prop({ default: true }) isPublished: boolean;
}
export const DocumentSchema = SchemaFactory.createForClass(InstitutionalDocument);

class CreateDocumentDto {
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsString() @MinLength(2) category: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) pdf?: AssetDto;
  @IsOptional() @IsUrl({}, { message: 'Link externo inválido.' }) externalLink?: string;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

@Injectable()
export class DocumentsService {
  constructor(@InjectModel(InstitutionalDocument.name) private readonly model: Model<DocItem>) {}
  findPublished(category?: string) {
    const filter: Record<string, unknown> = { isPublished: true };
    if (category) filter.category = category;
    return this.model.find(filter).sort({ order: 1, createdAt: -1 }).exec();
  }
  findAll() { return this.model.find().sort({ category: 1, order: 1 }).exec(); }
  findOne(id: string) { return this.model.findById(id).exec(); }
  create(dto: CreateDocumentDto) { return this.model.create(dto); }
  update(id: string, dto: UpdateDocumentDto) { return this.model.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly s: DocumentsService) {}
  @Public() @Get() pub(@Query('category') category?: string) { return this.s.findPublished(category); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all() { return this.s.findAll(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/:id') one(@Param('id') id: string) { return this.s.findOne(id); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateDocumentDto) { return this.s.create(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateDocumentDto) { return this.s.update(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: InstitutionalDocument.name, schema: DocumentSchema }])],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
