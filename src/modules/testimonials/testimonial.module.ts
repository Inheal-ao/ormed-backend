import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { AssetDto } from '../../common/dto/asset.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type TestimonialDocument = HydratedDocument<Testimonial>;

@Schema({ timestamps: true })
export class Testimonial {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '', trim: true }) role: string;
  @Prop({ default: '', trim: true }) location: string;
  @Prop({ required: true }) text: string;
  @Prop({ type: AssetSchema, default: null }) avatar: Asset | null;
  @Prop({ default: 0, index: true }) order: number;
  @Prop({ default: true }) isPublished: boolean;
}
export const TestimonialSchema = SchemaFactory.createForClass(Testimonial);

class CreateTestimonialDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() location?: string;
  @IsString() @MinLength(3) text: string;
  @IsOptional() @ValidateNested() @Type(() => AssetDto) avatar?: AssetDto;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateTestimonialDto extends PartialType(CreateTestimonialDto) {}

@Injectable()
export class TestimonialsService {
  constructor(@InjectModel(Testimonial.name) private readonly model: Model<TestimonialDocument>) {}
  findPublished() { return this.model.find({ isPublished: true }).sort({ order: 1, createdAt: 1 }).exec(); }
  findAll() { return this.model.find().sort({ order: 1, createdAt: 1 }).exec(); }
  create(dto: CreateTestimonialDto) { return this.model.create(dto); }
  update(id: string, dto: UpdateTestimonialDto) { return this.model.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly s: TestimonialsService) {}
  @Public() @Get() pub() { return this.s.findPublished(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all() { return this.s.findAll(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateTestimonialDto) { return this.s.create(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateTestimonialDto) { return this.s.update(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Testimonial.name, schema: TestimonialSchema }])],
  controllers: [TestimonialsController],
  providers: [TestimonialsService],
})
export class TestimonialsModule {}
