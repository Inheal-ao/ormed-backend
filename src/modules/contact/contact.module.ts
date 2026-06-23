import { Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type ContactMessageDocument = HydratedDocument<ContactMessage>;

@Schema({ timestamps: true })
export class ContactMessage {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true, lowercase: true }) email: string;
  @Prop({ default: '', trim: true }) subject: string;
  @Prop({ required: true, trim: true }) message: string;
  @Prop({ default: false, index: true }) read: boolean;
}
export const ContactMessageSchema = SchemaFactory.createForClass(ContactMessage);

class CreateContactDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsEmail({}, { message: 'Email inválido.' }) email: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsString() @MinLength(5) @MaxLength(5000) message: string;
}

@Injectable()
export class ContactService {
  constructor(@InjectModel(ContactMessage.name) private readonly model: Model<ContactMessageDocument>) {}
  create(dto: CreateContactDto) {
    return this.model.create({ name: dto.name, email: dto.email, subject: dto.subject ?? '', message: dto.message });
  }
  findAll() { return this.model.find().sort({ createdAt: -1 }).exec(); }
  markRead(id: string, read: boolean) { return this.model.findByIdAndUpdate(id, { read }, { new: true }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('contact')
export class ContactController {
  constructor(private readonly s: ContactService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async create(@Body() dto: CreateContactDto) {
    await this.s.create(dto);
    return { ok: true };
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  all() { return this.s.findAll(); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/read')
  read(@Param('id') id: string, @Body() body: { read?: boolean }) { return this.s.markRead(id, body.read !== false); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.s.remove(id); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/export')
  async export(@Res() res: Response) {
    const rows = await this.s.findAll();
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Nome', 'Email', 'Assunto', 'Mensagem', 'Data'].join(','),
      ...rows.map((r) => [esc(r.name), esc(r.email), esc(r.subject), esc(r.message), esc(new Date((r as any).createdAt).toLocaleString('pt-PT'))].join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mensagens-contacto.csv"');
    res.send('﻿' + csv);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: ContactMessage.name, schema: ContactMessageSchema }])],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
