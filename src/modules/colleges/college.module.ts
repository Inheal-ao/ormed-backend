import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseInterceptors, UploadedFile, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { UsersModule } from '../../users/users.module';
import { UsersService } from '../../users/users.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';

const MANAGE = [UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR]; // gere todos os colégios
const ALL = [UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR, UserRole.COLEGIO];

// ===== Schemas =====
@Schema({ timestamps: true })
export class College {
  @Prop({ required: true, trim: true }) name: string; // ex.: Colégio de Cardiologia
  @Prop({ default: '', trim: true }) especialidade: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: '', trim: true }) coordinator: string;
  @Prop({ default: 'ativo', enum: ['ativo', 'inativo'] }) status: string;
}
export const CollegeSchema = SchemaFactory.createForClass(College);
export type CollegeDocument = HydratedDocument<College>;

@Schema({ timestamps: true })
export class Interno {
  @Prop({ required: true, index: true }) college: string; // id do colégio
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '', trim: true }) numeroOrdem: string;
  @Prop({ default: '', trim: true }) biPassaporte: string;
  @Prop({ default: '', trim: true }) phone: string;
  @Prop({ default: '', trim: true }) email: string;
  @Prop({ default: '', trim: true }) anoInternato: string; // ex.: 1º ano
  @Prop({ default: '', trim: true }) hospital: string;
  @Prop({ default: '', trim: true }) orientador: string;
  @Prop({ default: 'ativo', enum: ['ativo', 'concluido', 'suspenso'] }) status: string;
}
export const InternoSchema = SchemaFactory.createForClass(Interno);
export type InternoDocument = HydratedDocument<Interno>;

@Schema({ timestamps: true })
export class Programa {
  @Prop({ required: true, index: true }) college: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '', trim: true }) ano: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: AssetSchema, default: null }) document: Asset | null;
}
export const ProgramaSchema = SchemaFactory.createForClass(Programa);
export type ProgramaDocument = HydratedDocument<Programa>;

@Schema({ timestamps: true })
export class Rotation {
  @Prop({ type: Types.ObjectId, ref: 'Interno', required: true, index: true }) interno: Types.ObjectId;
  @Prop({ required: true, index: true }) college: string;
  @Prop({ default: '', trim: true }) internoName: string;
  @Prop({ required: true, trim: true }) rotationName: string; // ex.: Cardiologia de Intervenção
  @Prop({ default: '', trim: true }) period: string; // ex.: 2025 - 1º semestre
  @Prop({ default: 0 }) grade: number;
  @Prop({ default: 20 }) maxGrade: number;
  @Prop({ default: '', trim: true }) evaluator: string;
  @Prop({ default: '' }) notes: string;
}
export const RotationSchema = SchemaFactory.createForClass(Rotation);
export type RotationDocument = HydratedDocument<Rotation>;

// ===== DTOs =====
class CollegeDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(120) especialidade?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(150) coordinator?: string;
  @IsOptional() @IsString() status?: string;
}
class InternoDto {
  @IsOptional() @IsString() @MaxLength(60) college?: string;
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(40) numeroOrdem?: string;
  @IsOptional() @IsString() @MaxLength(40) biPassaporte?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(40) anoInternato?: string;
  @IsOptional() @IsString() @MaxLength(120) hospital?: string;
  @IsOptional() @IsString() @MaxLength(120) orientador?: string;
  @IsOptional() @IsString() status?: string;
}
class ProgramaDto {
  @IsOptional() @IsString() @MaxLength(60) college?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(40) ano?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}
class RotationDto {
  @IsOptional() @IsString() interno?: string;
  @IsOptional() @IsString() @MaxLength(60) college?: string;
  @IsOptional() @IsString() @MaxLength(150) internoName?: string;
  @IsOptional() @IsString() @MaxLength(200) rotationName?: string;
  @IsOptional() @IsString() @MaxLength(60) period?: string;
  @IsOptional() @Type(() => Number) @IsNumber() grade?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxGrade?: number;
  @IsOptional() @IsString() @MaxLength(150) evaluator?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

@Injectable()
export class CollegesService {
  constructor(
    @InjectModel(College.name) private readonly colleges: Model<CollegeDocument>,
    @InjectModel(Interno.name) private readonly internos: Model<InternoDocument>,
    @InjectModel(Programa.name) private readonly programas: Model<ProgramaDocument>,
    @InjectModel(Rotation.name) private readonly rotations: Model<RotationDocument>,
    private readonly cloudinary: CloudinaryService,
    private readonly users: UsersService,
  ) {}

  /** Determina o colégio a usar: o perfil colégio é forçado ao seu; os outros usam o filtro pedido. */
  private async scope(actor: AuthUser, requested?: string): Promise<string | undefined> {
    if (actor.role === UserRole.COLEGIO) {
      const u = await this.users.findById(actor.userId);
      return (u as any)?.collegeId || '__none__';
    }
    return requested || undefined;
  }
  private async assertOwn(actor: AuthUser, college: string) {
    if (actor.role === UserRole.COLEGIO) {
      const u = await this.users.findById(actor.userId);
      if ((u as any)?.collegeId !== college) throw new ForbiddenException('Fora do seu colégio.');
    }
  }

  // Colégios
  async listColleges(actor: AuthUser) {
    if (actor.role === UserRole.COLEGIO) {
      const id = await this.scope(actor);
      return this.colleges.find({ _id: id }).exec();
    }
    return this.colleges.find().sort({ name: 1 }).exec();
  }
  createCollege(dto: CollegeDto) { return this.colleges.create(dto); }
  updateCollege(id: string, dto: CollegeDto) { return this.colleges.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  async removeCollege(id: string) { await this.colleges.findByIdAndDelete(id).exec(); return { ok: true }; }

  // Internos
  async listInternos(actor: AuthUser, college?: string) {
    const c = await this.scope(actor, college);
    return this.internos.find(c ? { college: c } : {}).sort({ createdAt: -1 }).exec();
  }
  async createInterno(actor: AuthUser, dto: InternoDto) {
    const college = (await this.scope(actor, dto.college)) ?? dto.college;
    if (!college) throw new ForbiddenException('Indique o colégio.');
    await this.assertOwn(actor, college);
    return this.internos.create({ ...dto, college });
  }
  async updateInterno(actor: AuthUser, id: string, dto: InternoDto) {
    const it = await this.internos.findById(id).exec();
    if (!it) throw new NotFoundException();
    await this.assertOwn(actor, it.college);
    return this.internos.findByIdAndUpdate(id, dto, { new: true }).exec();
  }
  async removeInterno(actor: AuthUser, id: string) {
    const it = await this.internos.findById(id).exec();
    if (!it) throw new NotFoundException();
    await this.assertOwn(actor, it.college);
    await this.internos.findByIdAndDelete(id).exec();
    return { ok: true };
  }

  // Programas
  async listProgramas(actor: AuthUser, college?: string) {
    const c = await this.scope(actor, college);
    return this.programas.find(c ? { college: c } : {}).sort({ createdAt: -1 }).exec();
  }
  async createPrograma(actor: AuthUser, dto: ProgramaDto, file?: Express.Multer.File) {
    const college = (await this.scope(actor, dto.college)) ?? dto.college;
    if (!college) throw new ForbiddenException('Indique o colégio.');
    await this.assertOwn(actor, college);
    let document: Asset | null = null;
    if (file) {
      const up = await this.cloudinary.uploadPdf(file, 'ormed/programas-internato');
      document = { url: up.url, publicId: up.publicId };
    }
    return this.programas.create({ ...dto, college, document });
  }
  async updatePrograma(actor: AuthUser, id: string, dto: ProgramaDto, file?: Express.Multer.File) {
    const p = await this.programas.findById(id).exec();
    if (!p) throw new NotFoundException();
    await this.assertOwn(actor, p.college);
    const patch: any = { ...dto };
    if (file) {
      const up = await this.cloudinary.uploadPdf(file, 'ormed/programas-internato');
      patch.document = { url: up.url, publicId: up.publicId };
    }
    return this.programas.findByIdAndUpdate(id, patch, { new: true }).exec();
  }
  async removePrograma(actor: AuthUser, id: string) {
    const p = await this.programas.findById(id).exec();
    if (!p) throw new NotFoundException();
    await this.assertOwn(actor, p.college);
    await this.programas.findByIdAndDelete(id).exec();
    return { ok: true };
  }

  // Rotações / notas
  async listRotations(actor: AuthUser, college?: string, interno?: string) {
    const c = await this.scope(actor, college);
    const filter: any = {};
    if (c) filter.college = c;
    if (interno) filter.interno = new Types.ObjectId(interno);
    return this.rotations.find(filter).sort({ createdAt: -1 }).exec();
  }
  async createRotation(actor: AuthUser, dto: RotationDto) {
    const college = (await this.scope(actor, dto.college)) ?? dto.college;
    if (!college || !dto.interno) throw new ForbiddenException('Indique o colégio e o interno.');
    await this.assertOwn(actor, college);
    const it = await this.internos.findById(dto.interno).exec();
    return this.rotations.create({ ...dto, college, interno: new Types.ObjectId(dto.interno), internoName: it?.name ?? '' });
  }
  async updateRotation(actor: AuthUser, id: string, dto: RotationDto) {
    const r = await this.rotations.findById(id).exec();
    if (!r) throw new NotFoundException();
    await this.assertOwn(actor, r.college);
    return this.rotations.findByIdAndUpdate(id, dto, { new: true }).exec();
  }
  async removeRotation(actor: AuthUser, id: string) {
    const r = await this.rotations.findById(id).exec();
    if (!r) throw new NotFoundException();
    await this.assertOwn(actor, r.college);
    await this.rotations.findByIdAndDelete(id).exec();
    return { ok: true };
  }
}

@Controller('colleges')
export class CollegesController {
  constructor(private readonly s: CollegesService) {}

  // Colégios
  @Roles(...ALL) @Get()
  list(@CurrentUser() a: AuthUser) { return this.s.listColleges(a); }
  @Roles(...MANAGE) @Post()
  create(@Body() dto: CollegeDto) { return this.s.createCollege(dto); }
  @Roles(...MANAGE) @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CollegeDto) { return this.s.updateCollege(id, dto); }
  @Roles(...MANAGE) @Delete(':id')
  remove(@Param('id') id: string) { return this.s.removeCollege(id); }

  // Internos
  @Roles(...ALL) @Get('internos/list')
  internos(@CurrentUser() a: AuthUser, @Query('college') c?: string) { return this.s.listInternos(a, c); }
  @Roles(...ALL) @Post('internos')
  createInterno(@CurrentUser() a: AuthUser, @Body() dto: InternoDto) { return this.s.createInterno(a, dto); }
  @Roles(...ALL) @Patch('internos/:id')
  updInterno(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: InternoDto) { return this.s.updateInterno(a, id, dto); }
  @Roles(...ALL) @Delete('internos/:id')
  delInterno(@CurrentUser() a: AuthUser, @Param('id') id: string) { return this.s.removeInterno(a, id); }

  // Programas
  @Roles(...ALL) @Get('programas/list')
  programas(@CurrentUser() a: AuthUser, @Query('college') c?: string) { return this.s.listProgramas(a, c); }
  @Roles(...ALL) @Post('programas') @UseInterceptors(FileInterceptor('document'))
  createPrograma(@CurrentUser() a: AuthUser, @Body() dto: ProgramaDto, @UploadedFile() f: Express.Multer.File) { return this.s.createPrograma(a, dto, f); }
  @Roles(...ALL) @Patch('programas/:id') @UseInterceptors(FileInterceptor('document'))
  updPrograma(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: ProgramaDto, @UploadedFile() f: Express.Multer.File) { return this.s.updatePrograma(a, id, dto, f); }
  @Roles(...ALL) @Delete('programas/:id')
  delPrograma(@CurrentUser() a: AuthUser, @Param('id') id: string) { return this.s.removePrograma(a, id); }

  // Rotações / notas
  @Roles(...ALL) @Get('rotations/list')
  rotations(@CurrentUser() a: AuthUser, @Query('college') c?: string, @Query('interno') i?: string) { return this.s.listRotations(a, c, i); }
  @Roles(...ALL) @Post('rotations')
  createRotation(@CurrentUser() a: AuthUser, @Body() dto: RotationDto) { return this.s.createRotation(a, dto); }
  @Roles(...ALL) @Patch('rotations/:id')
  updRotation(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: RotationDto) { return this.s.updateRotation(a, id, dto); }
  @Roles(...ALL) @Delete('rotations/:id')
  delRotation(@CurrentUser() a: AuthUser, @Param('id') id: string) { return this.s.removeRotation(a, id); }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: College.name, schema: CollegeSchema },
      { name: Interno.name, schema: InternoSchema },
      { name: Programa.name, schema: ProgramaSchema },
      { name: Rotation.name, schema: RotationSchema },
    ]),
    CloudinaryModule,
    UsersModule,
  ],
  controllers: [CollegesController],
  providers: [CollegesService],
})
export class CollegesModule {}
