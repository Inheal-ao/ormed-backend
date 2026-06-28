import {
  Module, Injectable, Controller, Get, Post, Patch, Param, Body, Query,
  UseInterceptors, UploadedFiles, UploadedFile, Res, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { UPLOAD_LIMITS } from '../../common/upload-limits';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { User, UserSchema, UserRole } from '../../users/schemas/user.schema';

export type ServiceRequestDocument = HydratedDocument<ServiceRequest>;

const SERVICE_TYPES = [
  'validacao-documentos',
  'inscricao',
  'renovacao-inscricao',
  'carteira-profissional',
  'pagar-cotas',
  'declaracao',
];
const PAID_TYPES = ['inscricao', 'renovacao-inscricao', 'carteira-profissional', 'pagar-cotas', 'declaracao'];
const TYPE_PREFIX: Record<string, string> = {
  'validacao-documentos': 'VD',
  'inscricao': 'IN',
  'renovacao-inscricao': 'RI',
  'carteira-profissional': 'CP',
  'pagar-cotas': 'CT',
  'declaracao': 'DC',
};
const ALLOWED_STATUSES = [
  'recebido', 'em-analise', 'rejeitado', 'validado', 'nao-validado',
  'aguarda-pagamento', 'pagamento-em-analise', 'pago', 'recibo-emitido',
  'enviado-bastonaria', 'aprovado-impressao', 'concluido',
];

@Schema({ timestamps: true })
export class ServiceRequest {
  @Prop({ required: true, enum: SERVICE_TYPES, index: true }) serviceType: string;
  @Prop({ required: true, unique: true, index: true }) serviceCode: string;
  @Prop({ required: true, trim: true }) requesterName: string;
  @Prop({ required: true, trim: true }) ownerName: string; // proprietário do documento
  @Prop({ default: '', trim: true }) institution: string;
  @Prop({ default: '', trim: true, lowercase: true }) email: string;
  @Prop({ required: true, trim: true }) phone: string;
  @Prop({ type: [AssetSchema], default: [] }) attachments: Asset[];
  @Prop({ default: '' }) details: string; // dados do formulário (ex.: inscrição)
  @Prop({ default: false }) isPaid: boolean;
  @Prop({ default: 'recebido', index: true }) status: string;
  @Prop({ default: '', trim: true }) statusDetail: string; // motivo / nota do operador
  // Pagamento (preenchido pelo operador para serviços pagos)
  @Prop({ default: '', trim: true }) paymentAmount: string;
  @Prop({ default: '', trim: true }) paymentInstructions: string; // coordenadas de pagamento
  @Prop({ type: AssetSchema, default: null }) paymentProof: Asset | null; // comprovativo do user
  @Prop({ type: AssetSchema, default: null }) receipt: Asset | null; // recibo emitido pelo operador
  @Prop({ default: '', trim: true }) adminNotes: string;
  // Emissão final (inscrição → 1ª carteira): nº de ordem atribuído + se as credenciais já foram emitidas
  @Prop({ default: '', trim: true }) memberNumeroOrdem: string;
  @Prop({ default: false }) credentialsIssued: boolean;
  // Histórico de etapas (quem fez o quê e quando)
  @Prop({
    type: [{ at: Date, by: String, action: String, status: String }],
    default: [],
  })
  history: { at: Date; by: string; action: string; status: string }[];
}
export const ServiceRequestSchema = SchemaFactory.createForClass(ServiceRequest);

// ===== DTOs =====
class CreateServiceRequestDto {
  @IsIn(SERVICE_TYPES) serviceType: string;
  @IsString() @MinLength(3) @MaxLength(150) requesterName: string;
  @IsOptional() @IsString() @MaxLength(150) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(200) institution?: string;
  @IsOptional() @IsString() @MaxLength(150) email?: string;
  @IsString() @MinLength(6) @MaxLength(40) phone: string;
  @IsOptional() @IsString() @MaxLength(8000) details?: string;
}
class RecoverDto {
  @IsString() @MinLength(2) @MaxLength(150) ownerName: string;
  @IsString() @MinLength(4) @MaxLength(40) phone: string;
}
class UpdateStatusDto {
  @IsIn(ALLOWED_STATUSES) status: string;
  @IsOptional() @IsString() @MaxLength(500) statusDetail?: string;
  @IsOptional() @IsString() @MaxLength(2000) adminNotes?: string;
}
class SetPaymentDto {
  @IsString() @MaxLength(60) paymentAmount: string;
  @IsString() @MaxLength(1000) paymentInstructions: string;
}
class BastonariaDecisionDto {
  @IsIn(['aprovar', 'devolver']) decision: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class EmitCarteiraDto {
  @IsString() @MinLength(2) @MaxLength(40) numeroOrdem: string;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 6): string {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectModel(ServiceRequest.name) private readonly model: Model<ServiceRequestDocument>,
    @InjectModel(User.name) private readonly userModel: Model<any>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** Resolve o nome do operador a partir do JWT (cai para o email). */
  private async operatorName(user?: AuthUser): Promise<string> {
    if (!user) return 'Sistema';
    try {
      const u = (await this.userModel.findById(user.userId).select('name email').lean().exec()) as any;
      return (u?.name as string) || (u?.email as string) || user.email || 'Operador';
    } catch {
      return user.email || 'Operador';
    }
  }

  private async uploadFiles(files: Express.Multer.File[]): Promise<Asset[]> {
    const out: Asset[] = [];
    for (const f of files ?? []) {
      const up = f.mimetype === 'application/pdf'
        ? await this.cloudinary.uploadPdf(f, 'ormed/solicitacoes')
        : await this.cloudinary.uploadImage(f, 'ormed/solicitacoes');
      out.push({ url: up.url, publicId: up.publicId });
    }
    return out;
  }

  private async genUniqueCode(type: string): Promise<string> {
    const prefix = TYPE_PREFIX[type] ?? 'SR';
    const year = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const code = `ORM-${prefix}-${year}-${randomCode(6)}`;
      const exists = await this.model.exists({ serviceCode: code });
      if (!exists) return code;
    }
    return `ORM-${prefix}-${year}-${randomCode(8)}`;
  }

  async create(dto: CreateServiceRequestDto, files: Express.Multer.File[]) {
    // A inscrição e a validação exigem documentos; os pedidos do médico (renovação,
    // 2ª via da carteira, declaração, cotas) podem não ter anexo à partida.
    const needsFiles = ['inscricao', 'validacao-documentos'].includes(dto.serviceType);
    if (needsFiles && (!files || files.length === 0)) {
      throw new BadRequestException('Anexe pelo menos um documento.');
    }
    const attachments = files?.length ? await this.uploadFiles(files) : [];
    const serviceCode = await this.genUniqueCode(dto.serviceType);
    const doc = await this.model.create({
      serviceType: dto.serviceType,
      serviceCode,
      requesterName: dto.requesterName,
      ownerName: (dto.ownerName && dto.ownerName.trim()) || dto.requesterName,
      institution: dto.institution ?? '',
      email: dto.email ?? '',
      phone: dto.phone,
      details: dto.details ?? '',
      attachments,
      isPaid: PAID_TYPES.includes(dto.serviceType),
      status: 'recebido',
      history: [{ at: new Date(), by: 'Utilizador (site)', action: 'Solicitação submetida', status: 'recebido' }],
    });
    return { serviceCode: doc.serviceCode };
  }

  /** Vista pública (sem dados sensíveis de outras pessoas). */
  private publicView(d: ServiceRequestDocument) {
    const canSubmitProof =
      d.isPaid && !!d.paymentInstructions &&
      ['aguarda-pagamento', 'pagamento-em-analise'].includes(d.status);
    return {
      serviceCode: d.serviceCode,
      serviceType: d.serviceType,
      requesterName: d.requesterName,
      ownerName: d.ownerName,
      status: d.status,
      statusDetail: d.statusDetail,
      isPaid: d.isPaid,
      payment: d.paymentInstructions
        ? { amount: d.paymentAmount, instructions: d.paymentInstructions }
        : null,
      hasPaymentProof: !!d.paymentProof,
      receiptUrl: d.receipt?.url ?? null,
      canSubmitProof,
      credentialsIssued: !!d.credentialsIssued,
      createdAt: (d as any).createdAt,
      // Linha do tempo pública (sem nomes de operadores)
      timeline: (d.history ?? []).map((h) => ({ at: h.at, action: h.action, status: h.status })),
    };
  }

  async track(code: string) {
    const d = await this.model.findOne({ serviceCode: code.trim().toUpperCase() }).exec();
    if (!d) throw new NotFoundException('Código de serviço não encontrado.');
    return this.publicView(d);
  }

  async recover(dto: RecoverDto) {
    const matches = await this.model
      .find({
        ownerName: new RegExp(`^${dto.ownerName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        phone: dto.phone.trim(),
      })
      .sort({ createdAt: -1 })
      .exec();
    if (matches.length === 0) {
      throw new NotFoundException('Nenhuma solicitação encontrada com esses dados.');
    }
    return matches.map((d) => ({
      serviceCode: d.serviceCode,
      serviceType: d.serviceType,
      status: d.status,
      createdAt: (d as any).createdAt,
    }));
  }

  async submitPaymentProof(code: string, file: Express.Multer.File) {
    const d = await this.model.findOne({ serviceCode: code.trim().toUpperCase() }).exec();
    if (!d) throw new NotFoundException('Código de serviço não encontrado.');
    if (!d.isPaid) throw new BadRequestException('Este serviço não requer pagamento.');
    if (!file) throw new BadRequestException('Anexe o comprovativo.');
    const [asset] = await this.uploadFiles([file]);
    d.paymentProof = asset;
    d.status = 'pagamento-em-analise';
    d.history.push({ at: new Date(), by: 'Utilizador (site)', action: 'Comprovativo enviado', status: 'pagamento-em-analise' });
    await d.save();
    return this.publicView(d);
  }

  // ===== Admin =====
  findAll(type?: string, status?: string) {
    const filter: Record<string, string> = {};
    if (type) filter.serviceType = type;
    if (status) filter.status = status;
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }
  async updateStatus(id: string, dto: UpdateStatusDto, user?: AuthUser) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Solicitação não encontrada.');
    const by = await this.operatorName(user);
    d.status = dto.status;
    if (dto.statusDetail !== undefined) d.statusDetail = dto.statusDetail;
    if (dto.adminNotes !== undefined) d.adminNotes = dto.adminNotes;
    d.history.push({ at: new Date(), by, action: dto.statusDetail ? `Estado atualizado — ${dto.statusDetail}` : 'Estado atualizado', status: dto.status });
    await d.save();
    return d;
  }

  async setPayment(id: string, dto: SetPaymentDto, user?: AuthUser) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Solicitação não encontrada.');
    const by = await this.operatorName(user);
    d.paymentAmount = dto.paymentAmount;
    d.paymentInstructions = dto.paymentInstructions;
    d.status = 'aguarda-pagamento';
    d.history.push({ at: new Date(), by, action: `Pagamento definido${dto.paymentAmount ? ' — ' + dto.paymentAmount : ''}`, status: 'aguarda-pagamento' });
    await d.save();
    return d;
  }

  async uploadReceipt(id: string, file: Express.Multer.File, user?: AuthUser) {
    if (!file) throw new BadRequestException('Anexe o recibo.');
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Solicitação não encontrada.');
    const by = await this.operatorName(user);
    const [asset] = await this.uploadFiles([file]);
    d.receipt = asset;
    d.status = 'recibo-emitido';
    d.history.push({ at: new Date(), by, action: 'Recibo emitido', status: 'recibo-emitido' });
    await d.save();
    return d;
  }

  /** Funcionário envia o processo (pago) para aprovação de impressão pela Bastonária. */
  async sendToBastonaria(id: string, user?: AuthUser) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Solicitação não encontrada.');
    if (d.serviceType !== 'inscricao') {
      throw new BadRequestException('Só as inscrições seguem para aprovação da Bastonária.');
    }
    if (!['pago', 'recibo-emitido'].includes(d.status)) {
      throw new BadRequestException('O processo só segue para a Bastonária após o pagamento estar confirmado.');
    }
    const by = await this.operatorName(user);
    d.status = 'enviado-bastonaria';
    d.history.push({ at: new Date(), by, action: 'Enviado à Bastonária para aprovação de impressão', status: 'enviado-bastonaria' });
    await d.save();
    return d;
  }

  /** Bastonária aprova (para impressão) ou devolve o processo. */
  async bastonariaDecision(id: string, dto: BastonariaDecisionDto, user?: AuthUser) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Solicitação não encontrada.');
    if (d.status !== 'enviado-bastonaria') {
      throw new BadRequestException('Este processo não está a aguardar a decisão da Bastonária.');
    }
    const by = await this.operatorName(user);
    if (dto.decision === 'aprovar') {
      d.status = 'aprovado-impressao';
      if (dto.note) d.statusDetail = dto.note;
      d.history.push({ at: new Date(), by, action: 'Aprovado pela Bastonária para emissão da carteira', status: 'aprovado-impressao' });
    } else {
      d.status = 'pago';
      d.statusDetail = dto.note ?? 'Devolvido pela Bastonária';
      d.history.push({ at: new Date(), by, action: `Devolvido pela Bastonária${dto.note ? ' — ' + dto.note : ''}`, status: 'pago' });
    }
    await d.save();
    return d;
  }

  /**
   * Marca a inscrição como concluída após a equipa atribuir o nº de ordem e emitir
   * a carteira (o registo do médico é feito à parte, em /members). Regista que as
   * credenciais foram emitidas para entrega ao candidato.
   */
  async markEmitida(id: string, dto: EmitCarteiraDto, user?: AuthUser) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Solicitação não encontrada.');
    if (d.status !== 'aprovado-impressao') {
      throw new BadRequestException('A carteira só pode ser emitida após a aprovação da Bastonária.');
    }
    const by = await this.operatorName(user);
    d.memberNumeroOrdem = dto.numeroOrdem.trim();
    d.credentialsIssued = true;
    d.status = 'concluido';
    d.history.push({ at: new Date(), by, action: `Carteira emitida — nº de ordem ${d.memberNumeroOrdem}; credenciais emitidas`, status: 'concluido' });
    await d.save();
    return d;
  }
}

@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly s: ServiceRequestsService) {}

  // ---- Público ----
  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post()
  @UseInterceptors(FilesInterceptor('attachments', 8, UPLOAD_LIMITS))
  create(@Body() dto: CreateServiceRequestDto, @UploadedFiles() files: Express.Multer.File[]) {
    return this.s.create(dto, files ?? []);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('track')
  track(@Query('code') code: string) {
    return this.s.track(code ?? '');
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('recover')
  recover(@Body() dto: RecoverDto) {
    return this.s.recover(dto);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('payment-proof')
  @UseInterceptors(FileInterceptor('proof', UPLOAD_LIMITS))
  submitProof(@Query('code') code: string, @UploadedFile() file: Express.Multer.File) {
    return this.s.submitPaymentProof(code ?? '', file);
  }

  // ---- Admin ----
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  all(@Query('type') type?: string, @Query('status') status?: string) {
    return this.s.findAll(type, status);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/status')
  status(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser() user: AuthUser) {
    return this.s.updateStatus(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/payment')
  payment(@Param('id') id: string, @Body() dto: SetPaymentDto, @CurrentUser() user: AuthUser) {
    return this.s.setPayment(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('receipt', UPLOAD_LIMITS))
  receipt(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.s.uploadReceipt(id, file, user);
  }

  // Funcionário/admin: envia a inscrição paga para a Bastonária
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/send-to-bastonaria')
  sendToBastonaria(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.s.sendToBastonaria(id, user);
  }

  // Exclusivo da Bastonária (super_admin também passa): aprova/devolve a impressão
  @Roles(UserRole.BASTONARIA)
  @Patch(':id/bastonaria')
  bastonaria(@Param('id') id: string, @Body() dto: BastonariaDecisionDto, @CurrentUser() user: AuthUser) {
    return this.s.bastonariaDecision(id, dto, user);
  }

  // Funcionário/admin: marca a carteira como emitida (após aprovação da Bastonária)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/emitida')
  emitida(@Param('id') id: string, @Body() dto: EmitCarteiraDto, @CurrentUser() user: AuthUser) {
    return this.s.markEmitida(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/export')
  async export(@Res() res: Response, @Query('type') type?: string) {
    const rows = await this.s.findAll(type);
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Código', 'Tipo', 'Solicitante', 'Proprietário', 'Instituição', 'Email', 'Telefone', 'Estado', 'Detalhe', 'Valor', 'Comprovativo', 'Recibo', 'Anexos', 'Data'].join(','),
      ...rows.map((r) =>
        [
          esc(r.serviceCode), esc(r.serviceType), esc(r.requesterName), esc(r.ownerName),
          esc(r.institution), esc(r.email), esc(r.phone), esc(r.status), esc(r.statusDetail),
          esc(r.paymentAmount), esc(r.paymentProof?.url ?? ''), esc(r.receipt?.url ?? ''),
          esc((r.attachments ?? []).map((a) => a.url).join(' | ')),
          esc(new Date((r as any).createdAt).toLocaleString('pt-PT')),
        ].join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="solicitacoes.csv"');
    res.send('﻿' + csv);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServiceRequest.name, schema: ServiceRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
    CloudinaryModule,
  ],
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
