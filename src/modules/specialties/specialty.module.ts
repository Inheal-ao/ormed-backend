import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

// ===== Schema =====
export type SpecialtyDocument = HydratedDocument<Specialty>;

@Schema({ timestamps: true })
export class Specialty {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: 0, index: true })
  order: number;

  @Prop({ default: true })
  isPublished: boolean;
}
export const SpecialtySchema = SchemaFactory.createForClass(Specialty);

// ===== DTO =====
class CreateSpecialtyDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
class UpdateSpecialtyDto extends PartialType(CreateSpecialtyDto) {}

// ===== Service =====
@Injectable()
export class SpecialtiesService {
  constructor(
    @InjectModel(Specialty.name) private readonly model: Model<SpecialtyDocument>,
  ) {}

  findPublished() {
    return this.model.find({ isPublished: true }).sort({ order: 1, name: 1 }).exec();
  }
  findAllOrdered() {
    return this.model.find().sort({ order: 1, name: 1 }).exec();
  }
  create(dto: CreateSpecialtyDto) {
    return this.model.create(dto);
  }
  update(id: string, dto: UpdateSpecialtyDto) {
    return this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
  }
  remove(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}

// ===== Controller =====
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly service: SpecialtiesService) {}

  @Public()
  @Get()
  findPublished() {
    return this.service.findPublished();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  findAll() {
    return this.service.findAllOrdered();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreateSpecialtyDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSpecialtyDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// ===== Module =====
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Specialty.name, schema: SpecialtySchema }]),
  ],
  controllers: [SpecialtiesController],
  providers: [SpecialtiesService],
  exports: [SpecialtiesService],
})
export class SpecialtiesModule {}
