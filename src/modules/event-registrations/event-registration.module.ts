import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseInterceptors, UploadedFiles, BadRequestException, Res,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type RegistrationDocument = HydratedDocument<EventRegistration>;

@Schema({ timestamps: true })
export class EventRegistration {
  @Prop({ type: Types.ObjectId, ref: 'Event', required: true, index: true }) event: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true, lowercase: true }) email: string;
  @Prop({ default: '', trim: true }) phone: string;
  @Prop({ default: '', trim: true }) notes: string;
  @Prop({ type: [AssetSchema], default: [] }) attachments: Asset[]; // documentos pessoais
  @Prop({ type: AssetSchema, default: null }) paymentProof: Asset | null; // comprovativo
  @Prop({ default: 'pending', enum: ['pending', 'validated', 'rejected'], index: true }) status: string;
  @Prop({ default: '', trim: true }) adminNotes: string;
}
export const RegistrationSchema = SchemaFactory.createForClass(EventRegistration);

class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class UpdateStatusDto {
  @IsIn(['pending', 'validated', 'rejected']) status: string;
  @IsOptional() @IsString() @MaxLength(1000) adminNotes?: string;
}

@Injectable()
export class RegistrationsService {
  constructor(
    @InjectModel(EventRegistration.name) private readonly model: Model<RegistrationDocument>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async register(
    eventId: string,
    dto: RegisterDto,
    files: { paymentProof?: Express.Multer.File[]; documents?: Express.Multer.File[] },
  ) {
    if (!Types.ObjectId.isValid(eventId)) throw new BadRequestException('Evento inválido.');

    const attachments: Asset[] = [];
    for (const doc of files.documents ?? []) {
      const isPdf = doc.mimetype === 'application/pdf';
      const up = isPdf ? await this.cloudinary.uploadPdf(doc, 'ormed/registrations')
                       : await this.cloudinary.uploadImage(doc, 'ormed/registrations');
      attachments.push({ url: up.url, publicId: up.publicId });
    }

    let paymentProof: Asset | null = null;
    const proof = files.paymentProof?.[0];
    if (proof) {
      const isPdf = proof.mimetype === 'application/pdf';
      const up = isPdf ? await this.cloudinary.uploadPdf(proof, 'ormed/registrations')
                       : await this.cloudinary.uploadImage(proof, 'ormed/registrations');
      paymentProof = { url: up.url, publicId: up.publicId };
    }

    return this.model.create({
      event: new Types.ObjectId(eventId),
      name: dto.name, email: dto.email, phone: dto.phone ?? '', notes: dto.notes ?? '',
      attachments, paymentProof, status: 'pending',
    });
  }

  findByEvent(eventId: string) {
    return this.model.find({ event: new Types.ObjectId(eventId) }).sort({ createdAt: -1 }).exec();
  }
  countByEvent(eventId: string) {
    return this.model.countDocuments({ event: new Types.ObjectId(eventId) }).exec();
  }
  updateStatus(id: string, dto: UpdateStatusDto) {
    return this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
  }
  remove(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}

@Controller('event-registrations')
export class RegistrationsController {
  constructor(private readonly s: RegistrationsService) {}

  // Inscrição pública (5/min por IP) com anexos
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':eventId')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'paymentProof', maxCount: 1 }, { name: 'documents', maxCount: 5 }]))
  register(
    @Param('eventId') eventId: string,
    @Body() dto: RegisterDto,
    @UploadedFiles() files: { paymentProof?: Express.Multer.File[]; documents?: Express.Multer.File[] },
  ) {
    return this.s.register(eventId, dto, files ?? {});
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin')
  list(@Query('eventId') eventId: string) {
    return this.s.findByEvent(eventId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.s.updateStatus(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.s.remove(id);
  }

  // Exportação CSV das inscrições de um evento
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/export')
  async export(@Query('eventId') eventId: string, @Res() res: Response) {
    const regs = await this.s.findByEvent(eventId);
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Nome', 'Email', 'Telefone', 'Estado', 'Comprovativo', 'Documentos', 'Data'].join(','),
      ...regs.map((r) =>
        [
          esc(r.name), esc(r.email), esc(r.phone), esc(r.status),
          esc(r.paymentProof?.url ?? ''),
          esc((r.attachments ?? []).map((a) => a.url).join(' | ')),
          esc(new Date((r as any).createdAt).toLocaleString('pt-PT')),
        ].join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="inscricoes-${eventId}.csv"`);
    res.send('﻿' + rows); // BOM para acentos no Excel
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: EventRegistration.name, schema: RegistrationSchema }]),
    CloudinaryModule,
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class EventRegistrationsModule {}
