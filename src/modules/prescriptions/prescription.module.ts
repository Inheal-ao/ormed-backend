import {
  Module, Injectable, Controller, Get, Post, Param, Query, Body,
  NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { Member, MemberSchema, MemberDocument } from '../members/member.module';

// ===== Schema =====
@Schema({ _id: false })
export class PrescriptionItem {
  @Prop({ default: '', trim: true }) medicamento: string;
  @Prop({ default: '', trim: true }) dosagem: string;     // ex.: 500 mg
  @Prop({ default: '', trim: true }) posologia: string;   // ex.: 1 comp. de 8/8h
  @Prop({ default: '', trim: true }) duracao: string;     // ex.: 7 dias
  @Prop({ default: '', trim: true }) quantidade: string;  // ex.: 1 caixa
}
const PrescriptionItemSchema = SchemaFactory.createForClass(PrescriptionItem);

@Schema({ timestamps: true })
export class Prescription {
  @Prop({ required: true, unique: true, index: true }) code: string; // RX-ANO-XXXXXX
  @Prop({ type: Types.ObjectId, ref: 'Member', index: true }) medico: Types.ObjectId;
  @Prop({ default: '' }) medicoName: string;
  @Prop({ default: '' }) medicoNumeroOrdem: string;
  @Prop({ default: '' }) especialidade: string;
  @Prop({ required: true, trim: true }) patientName: string;
  @Prop({ default: '', trim: true }) patientBI: string;
  @Prop({ default: '', trim: true }) patientIdade: string;
  @Prop({ type: [PrescriptionItemSchema], default: [] }) items: PrescriptionItem[];
  @Prop({ default: '' }) observacoes: string;
  @Prop({ default: 'ativa', enum: ['ativa', 'anulada'], index: true }) status: string;
}
export const PrescriptionSchema = SchemaFactory.createForClass(Prescription);
export type PrescriptionDocument = HydratedDocument<Prescription>;

// ===== DTOs =====
class ItemDto {
  @IsOptional() @IsString() @MaxLength(200) medicamento?: string;
  @IsOptional() @IsString() @MaxLength(60) dosagem?: string;
  @IsOptional() @IsString() @MaxLength(120) posologia?: string;
  @IsOptional() @IsString() @MaxLength(60) duracao?: string;
  @IsOptional() @IsString() @MaxLength(60) quantidade?: string;
}
class CreateDto {
  @IsString() numeroUtente: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string; // código de acesso do médico
  @IsString() @MinLength(2) @MaxLength(150) patientName: string;
  @IsOptional() @IsString() @MaxLength(40) patientBI?: string;
  @IsOptional() @IsString() @MaxLength(20) patientIdade?: string;
  @IsArray() items: ItemDto[];
  @IsOptional() @IsString() @MaxLength(2000) observacoes?: string;
}
class MineDto {
  @IsString() numeroUtente: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string;
}

// Lista local de medicamentos comuns (DCI/genéricos) — fiável e em português.
const MEDS = [
  'Paracetamol', 'Ibuprofeno', 'Ácido acetilsalicílico (Aspirina)', 'Amoxicilina',
  'Amoxicilina + Ácido clavulânico', 'Azitromicina', 'Ciprofloxacina', 'Doxiciclina',
  'Metronidazol', 'Ceftriaxona', 'Cefalexina', 'Penicilina G', 'Cloranfenicol',
  'Sulfametoxazol + Trimetoprim (Cotrimoxazol)', 'Eritromicina', 'Claritromicina',
  'Gentamicina', 'Nistatina', 'Fluconazol', 'Cetoconazol', 'Aciclovir',
  'Artemeter + Lumefantrina (Coartem)', 'Artesunato', 'Quinino', 'Sulfadoxina + Pirimetamina',
  'Cloroquina', 'Albendazol', 'Mebendazol', 'Praziquantel', 'Ivermectina',
  'Omeprazol', 'Pantoprazol', 'Ranitidina', 'Domperidona', 'Metoclopramida',
  'Hidróxido de alumínio + magnésio', 'Loperamida', 'Sais de reidratação oral (SRO)',
  'Sulfato ferroso', 'Ácido fólico', 'Complexo B', 'Vitamina C', 'Vitamina D',
  'Multivitamínico', 'Cálcio + Vitamina D', 'Sulfato de zinco',
  'Losartan', 'Enalapril', 'Captopril', 'Lisinopril', 'Amlodipina', 'Nifedipina',
  'Hidroclorotiazida', 'Furosemida', 'Espironolactona', 'Atenolol', 'Bisoprolol',
  'Carvedilol', 'Metoprolol', 'Propranolol', 'Digoxina', 'Sinvastatina', 'Atorvastatina',
  'Metformina', 'Glibenclamida', 'Gliclazida', 'Insulina (NPH)', 'Insulina (regular)',
  'Salbutamol', 'Beclometasona', 'Budesonida', 'Aminofilina', 'Prednisolona',
  'Prednisona', 'Dexametasona', 'Hidrocortisona', 'Betametasona',
  'Loratadina', 'Cetirizina', 'Clorfeniramina', 'Prometazina', 'Difenidramina',
  'Diazepam', 'Lorazepam', 'Amitriptilina', 'Fluoxetina', 'Sertralina', 'Haloperidol',
  'Carbamazepina', 'Ácido valpróico', 'Fenitoína', 'Fenobarbital', 'Gabapentina',
  'Tramadol', 'Codeína', 'Morfina', 'Diclofenac', 'Naproxeno', 'Cetoprofeno',
  'Dipirona (Metamizol)', 'Hioscina (Buscopan)', 'Ondansetron',
  'Levotiroxina', 'Misoprostol', 'Ocitocina', 'Ácido tranexâmico', 'Vitamina K',
  'Heparina', 'Varfarina', 'Clopidogrel', 'Warfarina',
  'Soro fisiológico 0,9%', 'Glicose 5%', 'Lactato de Ringer',
];

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectModel(Prescription.name) private readonly model: Model<PrescriptionDocument>,
    @InjectModel(Member.name) private readonly members: Model<MemberDocument>,
  ) {}

  private async verifyMedico(numeroUtente: string, code: string): Promise<MemberDocument> {
    const m = await this.members.findOne({ numeroUtente: (numeroUtente || '').trim() }).select('+accessCodeHash').exec();
    if (!m || !m.accessCodeHash || !(await bcrypt.compare((code || '').trim(), m.accessCodeHash))) {
      throw new ForbiddenException('Código de acesso inválido.');
    }
    if (m.situacao !== 'vigor') {
      throw new ForbiddenException('Só médicos com inscrição em vigor podem emitir receitas.');
    }
    return m;
  }

  private async genCode(): Promise<string> {
    const year = new Date().getFullYear();
    for (let i = 0; i < 8; i++) {
      const c = `RX-${year}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      if (!(await this.model.exists({ code: c }))) return c;
    }
    return `RX-${year}-${Date.now().toString().slice(-6)}`;
  }

  async create(dto: CreateDto) {
    const m = await this.verifyMedico(dto.numeroUtente, dto.code);
    const items = (dto.items ?? [])
      .map((it) => ({
        medicamento: String(it.medicamento ?? '').slice(0, 200),
        dosagem: String(it.dosagem ?? '').slice(0, 60),
        posologia: String(it.posologia ?? '').slice(0, 120),
        duracao: String(it.duracao ?? '').slice(0, 60),
        quantidade: String(it.quantidade ?? '').slice(0, 60),
      }))
      .filter((it) => it.medicamento.trim());
    if (items.length === 0) throw new BadRequestException('Adicione pelo menos um medicamento.');
    const code = await this.genCode();
    const p = await this.model.create({
      code, medico: m._id, medicoName: m.name, medicoNumeroOrdem: m.numeroOrdem, especialidade: m.especialidade,
      patientName: dto.patientName, patientBI: dto.patientBI ?? '', patientIdade: dto.patientIdade ?? '',
      items, observacoes: dto.observacoes ?? '', status: 'ativa',
    });
    return p;
  }

  async mine(dto: MineDto) {
    const m = await this.verifyMedico(dto.numeroUtente, dto.code);
    return this.model.find({ medico: m._id }).sort({ createdAt: -1 }).limit(100).exec();
  }

  /** Verificação pública de uma receita (para farmácias). */
  async publicByCode(code: string) {
    const p = await this.model.findOne({ code: (code || '').trim().toUpperCase() }).exec();
    if (!p) throw new NotFoundException('Receita não encontrada.');
    // Confirma a situação atual do médico.
    let medicoSituacao = 'desconhecida';
    if (p.medico) {
      const m = await this.members.findById(p.medico).exec();
      medicoSituacao = m?.situacao ?? 'desconhecida';
    }
    return {
      code: p.code, medicoName: p.medicoName, medicoNumeroOrdem: p.medicoNumeroOrdem,
      especialidade: p.especialidade, medicoSituacao,
      patientName: p.patientName, patientIdade: p.patientIdade,
      items: p.items, observacoes: p.observacoes, status: p.status,
      data: (p as any).createdAt,
    };
  }

  async searchMedicamentos(q: string) {
    const term = (q || '').trim();
    if (term.length < 2) return [];
    const low = term.toLowerCase();
    const local = MEDS.filter((m) => m.toLowerCase().includes(low));
    const names = new Set<string>(local);
    // Augmentação opcional por API gratuita (RxNav/NLM) — falha em silêncio.
    try {
      const res = await fetch(`https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(term)}`, {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data: any = await res.json();
        const groups = data?.drugGroup?.conceptGroup ?? [];
        for (const g of groups) for (const c of g?.conceptProperties ?? []) if (c?.name) names.add(c.name);
      }
    } catch { /* ignora */ }
    return [...names].slice(0, 25).map((name) => ({ name }));
  }

  // ---- Admin ----
  listAll() { return this.model.find().sort({ createdAt: -1 }).limit(300).exec(); }
}

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly s: PrescriptionsService) {}

  @Public() @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('medicamentos')
  meds(@Query('q') q: string) { return this.s.searchMedicamentos(q); }

  @Public() @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/:code')
  publicVerify(@Param('code') code: string) { return this.s.publicByCode(code); }

  @Public() @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateDto) { return this.s.create(dto); }

  @Public() @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('mine')
  mine(@Body() dto: MineDto) { return this.s.mine(dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Get('admin/all')
  all() { return this.s.listAll(); }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prescription.name, schema: PrescriptionSchema },
      { name: Member.name, schema: MemberSchema },
    ]),
  ],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
})
export class PrescriptionsModule {}
