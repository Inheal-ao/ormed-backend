import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type MilestoneDocument = HydratedDocument<Milestone>;

@Schema({ timestamps: true })
export class Milestone {
  @Prop({ required: true, trim: true }) year: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: 0, index: true }) order: number;
  @Prop({ default: true }) isPublished: boolean;
}
export const MilestoneSchema = SchemaFactory.createForClass(Milestone);

class CreateMilestoneDto {
  @IsString() @MinLength(1) year: string;
  @IsString() @MinLength(2) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

@Injectable()
export class TimelineService {
  constructor(@InjectModel(Milestone.name) private readonly model: Model<MilestoneDocument>) {}
  findPublished() { return this.model.find({ isPublished: true }).sort({ order: 1, year: 1 }).exec(); }
  findAll() { return this.model.find().sort({ order: 1, year: 1 }).exec(); }
  create(dto: CreateMilestoneDto) { return this.model.create(dto); }
  update(id: string, dto: UpdateMilestoneDto) { return this.model.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('timeline')
export class TimelineController {
  constructor(private readonly s: TimelineService) {}
  @Public() @Get() pub() { return this.s.findPublished(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Get('admin/all') all() { return this.s.findAll(); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Post() create(@Body() dto: CreateMilestoneDto) { return this.s.create(dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR) @Patch(':id') upd(@Param('id') id: string, @Body() dto: UpdateMilestoneDto) { return this.s.update(id, dto); }
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) @Delete(':id') del(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Milestone.name, schema: MilestoneSchema }])],
  controllers: [TimelineController],
  providers: [TimelineService],
})
export class TimelineModule {}
