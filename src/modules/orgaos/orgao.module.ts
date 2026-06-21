import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, OnApplicationBootstrap,
} from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type OrgaoDocument = HydratedDocument<Orgao>;

@Schema({ timestamps: true })
export class Orgao {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: 'nacional', enum: ['nacional', 'regional'], index: true }) scope: string;
  @Prop({ default: '', enum: ['', 'norte', 'centro', 'sul'] }) region: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: [{ name: String, role: String }], default: [] }) members: { name: string; role: string }[];
  @Prop({ default: 0 }) order: number;
  @Prop({ default: true }) isPublished: boolean;
}
export const OrgaoSchema = SchemaFactory.createForClass(Orgao);

class MemberDto {
  @IsString() @MinLength(1) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(150) role?: string;
}
class CreateOrgaoDto {
  @IsString() @MinLength(2) @MaxLength(200) name: string;
  @IsIn(['nacional', 'regional']) scope: string;
  @IsOptional() @IsIn(['', 'norte', 'centro', 'sul']) region?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MemberDto) members?: MemberDto[];
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
class UpdateOrgaoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsIn(['nacional', 'regional']) scope?: string;
  @IsOptional() @IsIn(['', 'norte', 'centro', 'sul']) region?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MemberDto) members?: MemberDto[];
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

@Injectable()
export class OrgaosService implements OnApplicationBootstrap {
  constructor(@InjectModel(Orgao.name) private readonly model: Model<OrgaoDocument>) {}

  findPublished() {
    return this.model.find({ isPublished: true }).sort({ scope: 1, order: 1 }).exec();
  }
  findAllForAdmin() {
    return this.model.find().sort({ scope: 1, order: 1 }).exec();
  }
  create(dto: CreateOrgaoDto) {
    return this.model.create(dto);
  }
  update(id: string, dto: UpdateOrgaoDto) {
    return this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
  }
  remove(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }

  /** Semeia a estrutura de órgãos no primeiro arranque (se vazio). */
  async onApplicationBootstrap() {
    const count = await this.model.estimatedDocumentCount();
    if (count > 0) return;
    const nacionais = [
      'Assembleia de Representantes',
      'Conselho Nacional',
      'Conselho Fiscal Nacional',
      'Conselho de Supervisão',
      'Conselho Nacional de Disciplina',
      'Conselho Nacional do Médico Interno',
      'Colégios',
    ];
    const regioes: { name: string; region: string }[] = [
      { name: 'Região Norte', region: 'norte' },
      { name: 'Região Centro', region: 'centro' },
      { name: 'Região Sul', region: 'sul' },
    ];
    await this.model.insertMany([
      ...nacionais.map((name, i) => ({ name, scope: 'nacional', region: '', order: i, members: [], isPublished: true })),
      ...regioes.map((r, i) => ({ name: r.name, scope: 'regional', region: r.region, order: i, members: [], isPublished: true })),
    ]);
  }
}

@Controller('orgaos')
export class OrgaosController {
  constructor(private readonly s: OrgaosService) {}

  @Public()
  @Get()
  findPublished() {
    return this.s.findPublished();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  all() {
    return this.s.findAllForAdmin();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreateOrgaoDto) {
    return this.s.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrgaoDto) {
    return this.s.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.s.remove(id);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Orgao.name, schema: OrgaoSchema }])],
  controllers: [OrgaosController],
  providers: [OrgaosService],
})
export class OrgaosModule {}
