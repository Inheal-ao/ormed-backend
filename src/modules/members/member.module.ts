import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query,
  NotFoundException, ForbiddenException, BadRequestException, OnApplicationBootstrap, Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { IsArray, IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type MemberDocument = HydratedDocument<Member>;
export type ChangeRequestDocument = HydratedDocument<MemberChangeRequest>;

const EDITABLE = ['name', 'phone', 'email', 'especialidade', 'provincia', 'residencia'] as const;

// Situação da inscrição na Ordem.
export const SITUACOES = ['vigor', 'suspensa', 'cancelada'] as const;
// Categorias do médico (atribuídas pelo Colégio, aprovadas pela Bastonária).
// clinico_geral é o estado base de qualquer médico inscrito.
export const CATEGORIAS = ['clinico_geral', 'interno', 'especialista', 'orientador'] as const;

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
  // Situação oficial da inscrição: Em Vigor / Suspensa / Cancelada.
  @Prop({ default: 'vigor', enum: SITUACOES, index: true }) situacao: string;
  @Prop({ default: '' }) situacaoMotivo: string; // motivo (disciplinar, quotas, a pedido, falecimento...)
  // Categorias do médico (interno/especialista/orientador). clinico_geral é o base.
  @Prop({ type: [String], default: ['clinico_geral'], index: true }) categorias: string[];
  // Colégio de especialidade a que está associado (interno/especialista).
  @Prop({ default: '', index: true }) collegeId: string;
  // Marca registos de demonstração (a substituir por médicos reais).
  @Prop({ default: false }) simulado: boolean;
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
  @IsOptional() @IsIn(SITUACOES as unknown as string[]) situacao?: string;
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
  @IsOptional() @IsIn(SITUACOES as unknown as string[]) situacao?: string;
  @IsOptional() @IsString() @MaxLength(300) situacaoMotivo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) categorias?: string[];
  @IsOptional() @IsString() @MaxLength(60) collegeId?: string;
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
export class MembersService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Members');
  constructor(
    @InjectModel(Member.name) private readonly model: Model<MemberDocument>,
    @InjectModel(MemberChangeRequest.name) private readonly reqModel: Model<ChangeRequestDocument>,
  ) {}

  /** Banco de médicos simulado para testes — substituível por médicos reais. */
  async onApplicationBootstrap() {
    try {
      if ((await this.model.estimatedDocumentCount()) > 0) return;
      const TEST_CODE = '123456';
      const hash = await bcrypt.hash(TEST_CODE, 12);
      const year = new Date().getFullYear();
      const provincias = ['Luanda', 'Benguela', 'Huambo', 'Huíla', 'Cabinda', 'Malanje', 'Namibe'];
      const nomes = [
        'António Manuel Silva', 'Maria José Fernandes', 'Pedro Kiala Lukombo', 'Ana Paula Costa',
        'João Baptista Neto', 'Esperança Domingos', 'Carlos Alberto Mendes', 'Luísa Cativa',
        'Manuel da Conceição', 'Teresa Bunga', 'Adão Sebastião', 'Filomena Quissanga',
        'Rui Gonçalves Dias', 'Beatriz Ngola', 'Hélder Capemba', 'Joana Muxima',
        'Domingos Tchikuteny', 'Cristina Lourenço', 'Eduardo Cardoso', 'Marta Sousa Lemos',
        'Nelson Kapenda', 'Sandra Catraio', 'Osvaldo Quéssua', 'Isabel Chitanda', 'Fernando Mukinda',
      ];
      const esp = [
        'Medicina Interna', 'Cardiologia', 'Pediatria', 'Cirurgia Geral', 'Ginecologia e Obstetrícia',
        'Anestesiologia', 'Ortopedia e Traumatologia', 'Neurologia', 'Psiquiatria', 'Dermatologia',
      ];
      // Distribuição: clínicos gerais, internos, especialistas e orientadores.
      const docs = nomes.map((name, i) => {
        let categorias = ['clinico_geral'];
        let especialidade = '';
        if (i % 5 === 1) { categorias = ['interno']; especialidade = esp[i % esp.length]; }
        else if (i % 5 === 2) { categorias = ['especialista']; especialidade = esp[i % esp.length]; }
        else if (i % 5 === 3) { categorias = ['especialista', 'orientador']; especialidade = esp[i % esp.length]; }
        const situacao = i % 11 === 4 ? 'suspensa' : i % 17 === 9 ? 'cancelada' : 'vigor';
        return {
          numeroUtente: `UT-${year}-${String(90001 + i)}`,
          numeroOrdem: `OM-${String(10001 + i)}`,
          name: `Dr(a). ${name}`,
          biPassaporte: `00${String(1000000 + i * 37)}LA0${(i % 9) + 1}`,
          phone: `9${String(20000000 + i * 13579).slice(0, 8)}`,
          email: `medico${i + 1}@exemplo.ao`,
          especialidade,
          provincia: provincias[i % provincias.length],
          residencia: provincias[i % provincias.length],
          categorias,
          situacao,
          situacaoMotivo: situacao === 'suspensa' ? 'Falta de pagamento de quotas' : situacao === 'cancelada' ? 'A pedido do médico' : '',
          status: 'ativo',
          simulado: true,
          accessCodeHash: hash,
        };
      });
      await this.model.insertMany(docs);
      this.logger.log(`Banco de médicos simulado criado (${docs.length} médicos). Código de acesso de teste: ${TEST_CODE}`);
    } catch (err) {
      this.logger.error(`Falha a semear médicos simulados: ${(err as Error).message}`);
    }
  }

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

  async findAll(opts: { search?: string; situacao?: string; categoria?: string; especialidade?: string } = {}) {
    const filter: Record<string, unknown> = {};
    if (opts.search) {
      const rx = new RegExp(opts.search.slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = ['name', 'numeroUtente', 'numeroOrdem', 'biPassaporte', 'phone'].map((f) => ({ [f]: rx }));
    }
    if (opts.situacao) filter.situacao = opts.situacao;
    if (opts.categoria) filter.categorias = opts.categoria;
    if (opts.especialidade) filter.especialidade = opts.especialidade;
    return this.model.find(filter).sort({ createdAt: -1 }).limit(500).exec();
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
    if (!m || !m.accessCodeHash) fail();
    if (m && m.situacao !== 'vigor') {
      throw new ForbiddenException(
        m.situacao === 'suspensa'
          ? 'A sua inscrição encontra-se suspensa. Regularize a sua situação junto da Ordem.'
          : 'A sua inscrição encontra-se cancelada.',
      );
    }
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR, UserRole.COLEGIO)
  @Get()
  all(
    @Query('search') search?: string,
    @Query('situacao') situacao?: string,
    @Query('categoria') categoria?: string,
    @Query('especialidade') especialidade?: string,
  ) { return this.s.findAll({ search, situacao, categoria, especialidade }); }

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
