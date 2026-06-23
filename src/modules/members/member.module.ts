import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query,
  NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type MemberDocument = HydratedDocument<Member>;
export type ChangeRequestDocument = HydratedDocument<MemberChangeRequest>;

const EDITABLE = ['name', 'phone', 'email', 'especialidade', 'provincia', 'residencia'] as const;

/** Médico inscrito na Ordem (ficha do membro). */
@Schema({ timestamps: true })
export class Member {
  @Prop({ required: true, unique: true, index: true }) numeroUtente: string;
  @Prop({ required: true, trim: true }) numeroOrdem: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true }) biPassaporte: string;
  @Prop({ required: true, trim: true }) phone: string;
  @Prop({ default: '', trim: true, lowercase: true }) email: string;
  @Prop({ default: '', trim: true }) especialidade: string;
  @Prop({ default: '', trim: true }) provincia: string;
  @Prop({ default: '', trim: true }) residencia: string;
  @Prop({ default: '' }) notes: string; // notas internas
  @Prop({ default: 'ativo', enum: ['ativo', 'suspenso'], index: true }) status: string;
  // Código de acesso de 6 dígitos (cifrado). select:false
  @Prop({ type: String, default: null, select: false }) accessCodeHash: string | null;
}
export const MemberSchema = SchemaFactory.createForClass(Member);

/** Pedido de alteração de dados (carece de aprovação da Ordem). */
@Schema({ timestamps: true })
export class MemberChangeRequest {
  @Prop({ type: Types.ObjectId, ref: 'Member', required: true, index: true }) member: Types.ObjectId;
  @Prop({ required: true }) numeroUtente: string;
  @Prop({ required: true }) memberName: string;
  @Prop({ type: Object, default: {} }) changes: Record<string, string>; // campo -> novo valor
  @Prop({ default: 'pending', enum: ['pending', 'approved', 'rejected'], index: true }) status: string;
  @Prop({ default: '' }) adminNotes: string;
}
export const ChangeRequestSchema = SchemaFactory.createForClass(MemberChangeRequest);

// ===== DTOs =====
class CreateMemberDto {
  @IsString() @MinLength(3) @MaxLength(150) name: string;
  @IsString() @MinLength(1) @MaxLength(40) numeroOrdem: string;
  @IsString() @MinLength(3) @MaxLength(40) biPassaporte: string;
  @IsString() @MinLength(6) @MaxLength(40) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(120) especialidade?: string;
  @IsOptional() @IsString() @MaxLength(80) provincia?: string;
  @IsOptional() @IsString() @MaxLength(200) residencia?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
class UpdateMemberDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(40) numeroOrdem?: string;
  @IsOptional() @IsString() @MaxLength(40) biPassaporte?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(120) especialidade?: string;
  @IsOptional() @IsString() @MaxLength(80) provincia?: string;
  @IsOptional() @IsString() @MaxLength(200) residencia?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() status?: string;
}
class AccessDto {
  @IsString() numeroUtente: string;
  @IsString() biPassaporte: string;
  @IsString() phone: string;
  @IsString() numeroOrdem: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string;
}
class ChangeReqDto {
  @IsString() numeroUtente: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string;
  @IsObject() changes: Record<string, string>;
}
class ResolveDto {
  @IsString() status: string; // approved | rejected
  @IsOptional() @IsString() @MaxLength(1000) adminNotes?: string;
}

@Injectable()
export class MembersService {
  constructor(
    @InjectModel(Member.name) private readonly model: Model<MemberDocument>,
    @InjectModel(MemberChangeRequest.name) private readonly reqModel: Model<ChangeRequestDocument>,
  ) {}

  private safe(m: MemberDocument) {
    const o = m.toObject ? m.toObject() : (m as any);
    delete o.accessCodeHash;
    return o;
  }

  private async genNumero(): Promise<string> {
    const year = new Date().getFullYear();
    for (let i = 0; i < 8; i++) {
      const n = `UT-${year}-${String(randomInt(0, 100000)).padStart(5, '0')}`;
      if (!(await this.model.exists({ numeroUtente: n }))) return n;
    }
    return `UT-${year}-${Date.now().toString().slice(-6)}`;
  }

  /** Cria membro, gera nº de utente e código de acesso (devolve o código uma vez). */
  async create(dto: CreateMemberDto) {
    const numeroUtente = await this.genNumero();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const accessCodeHash = await bcrypt.hash(code, 12);
    const m = await this.model.create({ ...dto, numeroUtente, accessCodeHash, status: 'ativo' });
    return { member: this.safe(m), numeroUtente, accessCode: code };
  }

  async findAll(search?: string) {
    const filter = search
      ? { $or: ['name', 'numeroUtente', 'numeroOrdem', 'biPassaporte', 'phone'].map((f) => ({ [f]: new RegExp(search.slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) }
      : {};
    return this.model.find(filter).sort({ createdAt: -1 }).limit(300).exec();
  }
  findOne(id: string) { return this.model.findById(id).exec(); }
  update(id: string, dto: UpdateMemberDto) { return this.model.findByIdAndUpdate(id, dto, { new: true }).exec(); }
  async remove(id: string) { await this.model.findByIdAndDelete(id).exec(); return { ok: true }; }

  async regenCode(id: string) {
    const m = await this.model.findById(id).exec();
    if (!m) throw new NotFoundException('Membro não encontrado.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    m.accessCodeHash = await bcrypt.hash(code, 12);
    await m.save();
    return { accessCode: code };
  }

  /** Verifica as 5 credenciais e devolve a ficha. */
  async access(dto: AccessDto) {
    const m = await this.model.findOne({ numeroUtente: dto.numeroUtente.trim() }).select('+accessCodeHash').exec();
    const fail = () => { throw new ForbiddenException('Dados de acesso inválidos. Verifique e tente novamente.'); };
    if (!m || m.status !== 'ativo' || !m.accessCodeHash) fail();
    const ok =
      m!.biPassaporte.toLowerCase() === dto.biPassaporte.trim().toLowerCase() &&
      m!.phone === dto.phone.trim() &&
      m!.numeroOrdem.toLowerCase() === dto.numeroOrdem.trim().toLowerCase() &&
      (await bcrypt.compare(dto.code.trim(), m!.accessCodeHash!));
    if (!ok) fail();
    return this.safe(m!);
  }

  /** Cria um pedido de alteração (re-verifica nº de utente + código). */
  async requestChange(dto: ChangeReqDto) {
    const m = await this.model.findOne({ numeroUtente: dto.numeroUtente.trim() }).select('+accessCodeHash').exec();
    if (!m || !m.accessCodeHash || !(await bcrypt.compare(dto.code.trim(), m.accessCodeHash))) {
      throw new ForbiddenException('Código de acesso inválido.');
    }
    const changes: Record<string, string> = {};
    for (const k of EDITABLE) {
      if (dto.changes[k] !== undefined && String(dto.changes[k]) !== String((m as any)[k] ?? '')) {
        changes[k] = String(dto.changes[k]).slice(0, 300);
      }
    }
    if (Object.keys(changes).length === 0) throw new BadRequestException('Não há alterações para submeter.');
    await this.reqModel.create({ member: m._id, numeroUtente: m.numeroUtente, memberName: m.name, changes, status: 'pending' });
    return { ok: true };
  }

  listChangeRequests(status?: string) {
    const filter = status ? { status } : {};
    return this.reqModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /** Aprova (aplica as alterações) ou rejeita um pedido. */
  async resolveChange(id: string, dto: ResolveDto) {
    const r = await this.reqModel.findById(id).exec();
    if (!r) throw new NotFoundException('Pedido não encontrado.');
    if (dto.status === 'approved') {
      const apply: Record<string, string> = {};
      for (const k of EDITABLE) if (r.changes[k] !== undefined) apply[k] = r.changes[k];
      await this.model.findByIdAndUpdate(r.member, apply).exec();
    }
    r.status = dto.status === 'approved' ? 'approved' : 'rejected';
    r.adminNotes = dto.adminNotes ?? '';
    await r.save();
    return r;
  }
}

@Controller('members')
export class MembersController {
  constructor(private readonly s: MembersService) {}

  // ---- Médico (público, com verificação) ----
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('access')
  access(@Body() dto: AccessDto) { return this.s.access(dto); }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('change-request')
  change(@Body() dto: ChangeReqDto) { return this.s.requestChange(dto); }

  // ---- Gestão (Ordem) ----
  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Get()
  all(@Query('search') search?: string) { return this.s.findAll(search); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Get('change-requests/all')
  changeReqs(@Query('status') status?: string) { return this.s.listChangeRequests(status); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Patch('change-requests/:id')
  resolve(@Param('id') id: string, @Body() dto: ResolveDto) { return this.s.resolveChange(id, dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreateMemberDto) { return this.s.create(dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Get(':id')
  one(@Param('id') id: string) { return this.s.findOne(id); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto) { return this.s.update(id, dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Post(':id/code')
  regen(@Param('id') id: string) { return this.s.regenCode(id); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.s.remove(id); }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Member.name, schema: MemberSchema },
      { name: MemberChangeRequest.name, schema: ChangeRequestSchema },
    ]),
  ],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
