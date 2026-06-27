import {
  Module, Injectable, Controller, Get, Post, Put, Param, Body, Query,
  NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { IsArray, IsNumber, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { Member, MemberSchema, MemberDocument, memberCodeMatches } from '../members/member.module';

const ADMIN = [UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR];
const SET = [UserRole.SUPER_ADMIN, UserRole.BASTONARIA]; // só a Bastonária define valores

// ===== Schemas =====
@Schema({ timestamps: true })
export class QuotaSettings {
  @Prop({ default: 0, min: 0 }) cotaMensal: number; // valor mensal da cota
  @Prop({ default: 0, min: 0 }) multaMensal: number; // multa por mês em atraso
  @Prop({ default: '' }) inicioCobranca: string; // 'YYYY-MM' (a partir de quando se cobra)
  @Prop({ default: '' }) updatedByName: string;
}
export const QuotaSettingsSchema = SchemaFactory.createForClass(QuotaSettings);
export type QuotaSettingsDocument = HydratedDocument<QuotaSettings>;

@Schema({ timestamps: true })
export class QuotaPayment {
  @Prop({ type: Types.ObjectId, ref: 'Member', required: true, index: true }) member: Types.ObjectId;
  @Prop({ required: true }) numeroUtente: string;
  @Prop({ required: true }) memberName: string;
  @Prop({ type: [String], default: [] }) meses: string[]; // meses pagos ('YYYY-MM')
  @Prop({ default: 0 }) cotaMensal: number;
  @Prop({ default: 0 }) multaMensal: number;
  @Prop({ default: 0 }) total: number;
  @Prop({ required: true, index: true }) recibo: string;
  @Prop({ default: 'portal' }) method: string; // portal | balcao
  @Prop({ default: '' }) registadoPor: string;
}
export const QuotaPaymentSchema = SchemaFactory.createForClass(QuotaPayment);
export type QuotaPaymentDocument = HydratedDocument<QuotaPayment>;

// ===== DTOs =====
class SettingsDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cotaMensal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) multaMensal?: number;
  @IsOptional() @IsString() @MaxLength(7) inicioCobranca?: string;
}
class PayDto {
  @IsOptional() @IsArray() @IsString({ each: true }) meses?: string[];
}
class PortalStatusDto {
  @IsString() numeroUtente: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string;
}
class PortalPayDto extends PortalStatusDto {
  @IsOptional() @IsArray() @IsString({ each: true }) meses?: string[];
}

// ===== Helpers =====
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthsBetween(start: string, end: string): string[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (!sy || !sm) return [];
  const out: string[] = [];
  let y = sy, m = sm, guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
    guard++;
  }
  return out;
}

@Injectable()
export class QuotasService {
  constructor(
    @InjectModel(QuotaSettings.name) private readonly settingsModel: Model<QuotaSettingsDocument>,
    @InjectModel(QuotaPayment.name) private readonly payModel: Model<QuotaPaymentDocument>,
    @InjectModel(Member.name) private readonly members: Model<MemberDocument>,
  ) {}

  async getSettings() {
    let s = await this.settingsModel.findOne().exec();
    if (!s) s = await this.settingsModel.create({ cotaMensal: 0, multaMensal: 0, inicioCobranca: `${new Date().getFullYear()}-01` });
    return s;
  }
  /** Estatísticas financeiras de cotas para o dashboard. */
  async stats() {
    const s = await this.getSettings();
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const [aggAll, aggMes] = await Promise.all([
      this.payModel.aggregate([{ $group: { _id: null, total: { $sum: '$total' }, n: { $sum: 1 } } }]),
      this.payModel.aggregate([{ $match: { createdAt: { $gte: startMonth } } }, { $group: { _id: null, total: { $sum: '$total' }, n: { $sum: 1 } } }]),
    ]);
    return {
      cotaMensal: s.cotaMensal, multaMensal: s.multaMensal,
      arrecadadoTotal: (aggAll as { total: number }[])[0]?.total ?? 0,
      pagamentosTotal: (aggAll as { n: number }[])[0]?.n ?? 0,
      arrecadadoMes: (aggMes as { total: number }[])[0]?.total ?? 0,
      pagamentosMes: (aggMes as { n: number }[])[0]?.n ?? 0,
    };
  }
  async updateSettings(dto: SettingsDto, actor: AuthUser & { name?: string }) {
    const s = await this.getSettings();
    if (dto.cotaMensal !== undefined) s.cotaMensal = dto.cotaMensal;
    if (dto.multaMensal !== undefined) s.multaMensal = dto.multaMensal;
    if (dto.inicioCobranca !== undefined && /^\d{4}-\d{2}$/.test(dto.inicioCobranca)) s.inicioCobranca = dto.inicioCobranca;
    await s.save();
    return s;
  }

  /** Situação de cotas de um médico. */
  async statusFor(member: MemberDocument) {
    const s = await this.getSettings();
    const start = /^\d{4}-\d{2}$/.test(s.inicioCobranca) ? s.inicioCobranca : `${new Date().getFullYear()}-01`;
    const expected = monthsBetween(start, currentMonth());
    const pays = await this.payModel.find({ member: member._id }).exec();
    const paid = new Set<string>();
    pays.forEach((p) => p.meses.forEach((m) => paid.add(m)));
    const mesesEmFalta = expected.filter((m) => !paid.has(m));
    const divida = mesesEmFalta.length * (s.cotaMensal + s.multaMensal);
    return {
      cotaMensal: s.cotaMensal, multaMensal: s.multaMensal,
      mesesEmFalta, mesesPagos: [...paid].sort(), divida,
      emDia: mesesEmFalta.length === 0,
    };
  }

  async statusById(id: string) {
    const m = await this.members.findById(id).exec();
    if (!m) throw new NotFoundException('Médico não encontrado.');
    const status = await this.statusFor(m);
    const payments = await this.payModel.find({ member: m._id }).sort({ createdAt: -1 }).limit(50).exec();
    return { member: { _id: m._id, name: m.name, numeroUtente: m.numeroUtente, numeroOrdem: m.numeroOrdem, especialidade: m.especialidade, situacao: m.situacao }, status, payments };
  }

  /** Regista um pagamento (paga os meses indicados ou todos os em falta) e emite recibo. */
  async pay(member: MemberDocument, meses: string[] | undefined, method: string, registadoPor = '') {
    const s = await this.getSettings();
    const status = await this.statusFor(member);
    const target = (meses && meses.length ? meses.filter((m) => status.mesesEmFalta.includes(m)) : status.mesesEmFalta);
    if (target.length === 0) throw new BadRequestException('Não há cotas em falta para pagar.');
    const total = target.length * (s.cotaMensal + s.multaMensal);
    const recibo = `REC-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
    const payment = await this.payModel.create({
      member: member._id, numeroUtente: member.numeroUtente, memberName: member.name,
      meses: target, cotaMensal: s.cotaMensal, multaMensal: s.multaMensal, total, recibo, method, registadoPor,
    });
    const newStatus = await this.statusFor(member);
    return { recibo, payment, status: newStatus };
  }

  async payById(id: string, dto: PayDto, registadoPor = '') {
    const m = await this.members.findById(id).exec();
    if (!m) throw new NotFoundException('Médico não encontrado.');
    return this.pay(m, dto.meses, 'balcao', registadoPor);
  }

  // ---- Portal (verificado pelo código de acesso ou de recuperação) ----
  private async verify(numeroUtente: string, code: string) {
    const m = await this.members.findOne({ numeroUtente: numeroUtente.trim() }).select('+accessCodeHash +recoveryCodesHash').exec();
    if (!m || !(await memberCodeMatches(m as any, code))) {
      throw new ForbiddenException('Código de acesso inválido.');
    }
    return m;
  }
  async portalStatus(dto: PortalStatusDto) {
    const m = await this.verify(dto.numeroUtente, dto.code);
    return { memberName: m.name, numeroOrdem: m.numeroOrdem, ...(await this.statusFor(m)) };
  }
  async portalPay(dto: PortalPayDto) {
    const m = await this.verify(dto.numeroUtente, dto.code);
    const res = await this.pay(m, dto.meses, 'portal');
    return { memberName: m.name, numeroOrdem: m.numeroOrdem, ...res };
  }
}

@Controller('quotas')
export class QuotasController {
  constructor(private readonly s: QuotasService) {}

  @Public() @Throttle({ default: { limit: 12, ttl: 60_000 } }) @Post('portal/status')
  portalStatus(@Body() dto: PortalStatusDto) { return this.s.portalStatus(dto); }
  @Public() @Throttle({ default: { limit: 8, ttl: 60_000 } }) @Post('portal/pay')
  portalPay(@Body() dto: PortalPayDto) { return this.s.portalPay(dto); }

  @Roles(...ADMIN) @Get('settings')
  getSettings() { return this.s.getSettings(); }
  @Roles(...ADMIN) @Get('stats')
  stats() { return this.s.stats(); }
  @Roles(...SET) @Put('settings')
  setSettings(@Body() dto: SettingsDto, @CurrentUser() a: AuthUser) { return this.s.updateSettings(dto, a); }

  @Roles(...ADMIN) @Get('member/:id')
  member(@Param('id') id: string) { return this.s.statusById(id); }
  @Roles(...ADMIN) @Post('member/:id/pay')
  payMember(@Param('id') id: string, @Body() dto: PayDto, @CurrentUser() a: AuthUser) { return this.s.payById(id, dto, a.role); }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuotaSettings.name, schema: QuotaSettingsSchema },
      { name: QuotaPayment.name, schema: QuotaPaymentSchema },
      { name: Member.name, schema: MemberSchema },
    ]),
  ],
  controllers: [QuotasController],
  providers: [QuotasService],
})
export class QuotasModule {}
