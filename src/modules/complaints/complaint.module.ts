import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseInterceptors, UploadedFiles, Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { RequireCaptcha } from '../../common/captcha/captcha.module';

export type ComplaintDocument = HydratedDocument<Complaint>;

const CATEGORIES = ['medico', 'ordem', 'atraso', 'outro'];

/** Denúncia ou reclamação submetida pelo público. */
@Schema({ timestamps: true })
export class Complaint {
  @Prop({ default: 'outro', enum: CATEGORIES, index: true }) category: string;
  @Prop({ required: true, trim: true }) subject: string;
  @Prop({ required: true }) description: string;
  @Prop({ default: false }) isAnonymous: boolean;
  @Prop({ default: '', trim: true }) name: string;
  @Prop({ default: '', trim: true, lowercase: true }) email: string;
  @Prop({ default: '', trim: true }) phone: string;
  @Prop({ type: [AssetSchema], default: [] }) attachments: Asset[]; // provas (imagem/pdf)
  @Prop({ default: '', trim: true }) externalLink: string; // link de vídeo/outra prova
  @Prop({ default: 'new', enum: ['new', 'reviewing', 'resolved'], index: true }) status: string;
  @Prop({ default: '', trim: true }) adminNotes: string;
}
export const ComplaintSchema = SchemaFactory.createForClass(Complaint);

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

class CreateComplaintDto {
  @IsIn(CATEGORIES) category: string;
  @IsString() @MinLength(3) @MaxLength(200) subject: string;
  @IsString() @MinLength(10) @MaxLength(5000) description: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isAnonymous?: boolean;
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) externalLink?: string;
}
class UpdateComplaintDto {
  @IsIn(['new', 'reviewing', 'resolved']) status: string;
  @IsOptional() @IsString() @MaxLength(2000) adminNotes?: string;
}

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectModel(Complaint.name) private readonly model: Model<ComplaintDocument>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(dto: CreateComplaintDto, files: Express.Multer.File[]) {
    const attachments: Asset[] = [];
    for (const f of files ?? []) {
      const isPdf = f.mimetype === 'application/pdf';
      const up = isPdf
        ? await this.cloudinary.uploadPdf(f, 'ormed/complaints')
        : await this.cloudinary.uploadImage(f, 'ormed/complaints');
      attachments.push({ url: up.url, publicId: up.publicId });
    }
    const anon = !!dto.isAnonymous;
    return this.model.create({
      category: dto.category,
      subject: dto.subject,
      description: dto.description,
      isAnonymous: anon,
      name: anon ? '' : dto.name ?? '',
      email: anon ? '' : dto.email ?? '',
      phone: anon ? '' : dto.phone ?? '',
      externalLink: dto.externalLink ?? '',
      attachments,
      status: 'new',
    });
  }

  findAll(status?: string) {
    const filter = status ? { status } : {};
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }
  updateStatus(id: string, dto: UpdateComplaintDto) {
    return this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
  }
  remove(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly s: ComplaintsService) {}

  @Public()
  @RequireCaptcha()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @UseInterceptors(FilesInterceptor('attachments', 5))
  create(@Body() dto: CreateComplaintDto, @UploadedFiles() files: Express.Multer.File[]) {
    return this.s.create(dto, files ?? []);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  all(@Query('status') status?: string) {
    return this.s.findAll(status);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/status')
  status(@Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.s.updateStatus(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.s.remove(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/export')
  async export(@Res() res: Response) {
    const rows = await this.s.findAll();
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Categoria', 'Assunto', 'Descrição', 'Anónimo', 'Nome', 'Email', 'Telefone', 'Link', 'Anexos', 'Estado', 'Data'].join(','),
      ...rows.map((r) =>
        [
          esc(r.category), esc(r.subject), esc(r.description), esc(r.isAnonymous ? 'Sim' : 'Não'),
          esc(r.name), esc(r.email), esc(r.phone), esc(r.externalLink),
          esc((r.attachments ?? []).map((a) => a.url).join(' | ')),
          esc(r.status), esc(new Date((r as any).createdAt).toLocaleString('pt-PT')),
        ].join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="denuncias-reclamacoes.csv"');
    res.send('﻿' + csv);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Complaint.name, schema: ComplaintSchema }]),
    CloudinaryModule,
  ],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
