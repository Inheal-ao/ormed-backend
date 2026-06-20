import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { AssetDto } from '../../common/dto/asset.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type GalleryDocument = HydratedDocument<GalleryPhoto>;

@Schema({ timestamps: true })
export class GalleryPhoto {
  @Prop({ type: AssetSchema, required: true }) image: Asset;
  @Prop({ default: '', trim: true }) caption: string;
  @Prop({ default: 0, index: true }) order: number;
  @Prop({ default: true }) isPublished: boolean;
}
export const GallerySchema = SchemaFactory.createForClass(GalleryPhoto);

class CreateGalleryDto {
  @ValidateNested() @Type(() => AssetDto) image: AssetDto;
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateGalleryDto extends PartialType(CreateGalleryDto) {}

@Injectable()
export class GalleryService {
  constructor(@InjectModel(GalleryPhoto.name) private readonly model: Model<GalleryDocument>) {}
  findPublished() { return this.model.find({ isPublished: true }).sort({ order: 1, createdAt: -1 }).exec(); }
  findAll() { return this.model.find().sort({ order: 1, createdAt: -1 }).exec(); }
  create(dto: CreateGalleryDto) { return this.model.create(dto); }
  update(id: string, dto: UpdateGalleryDto) { return this.model.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('gallery')
export class GalleryController {
  constructor(private readonly s: GalleryService) {}
  @Public() @Get() pub() { return this.s.findPublished(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all() { return this.s.findAll(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateGalleryDto) { return this.s.create(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateGalleryDto) { return this.s.update(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: GalleryPhoto.name, schema: GallerySchema }])],
  controllers: [GalleryController],
  providers: [GalleryService],
})
export class GalleryModule {}
