import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type FaqDocument = HydratedDocument<Faq>;

@Schema({ timestamps: true })
export class Faq {
  @Prop({ required: true, trim: true }) question: string;
  @Prop({ required: true }) answer: string;
  @Prop({ default: 0, index: true }) order: number;
  @Prop({ default: true }) isPublished: boolean;
}
export const FaqSchema = SchemaFactory.createForClass(Faq);

class CreateFaqDto {
  @IsString() @MinLength(3) question: string;
  @IsString() @MinLength(3) answer: string;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateFaqDto extends PartialType(CreateFaqDto) {}

@Injectable()
export class FaqsService {
  constructor(@InjectModel(Faq.name) private readonly model: Model<FaqDocument>) {}
  findPublished() { return this.model.find({ isPublished: true }).sort({ order: 1, createdAt: 1 }).exec(); }
  findAll() { return this.model.find().sort({ order: 1, createdAt: 1 }).exec(); }
  create(dto: CreateFaqDto) { return this.model.create(dto); }
  update(id: string, dto: UpdateFaqDto) { return this.model.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('faqs')
export class FaqsController {
  constructor(private readonly s: FaqsService) {}
  @Public() @Get() pub() { return this.s.findPublished(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all() { return this.s.findAll(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateFaqDto) { return this.s.create(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateFaqDto) { return this.s.update(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Faq.name, schema: FaqSchema }])],
  controllers: [FaqsController],
  providers: [FaqsService],
})
export class FaqsModule {}
