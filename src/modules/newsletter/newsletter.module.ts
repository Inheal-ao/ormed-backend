import { Module, Injectable, Controller, Get, Post, Delete, Param, Body, Res, ConflictException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type SubscriberDocument = HydratedDocument<Subscriber>;

@Schema({ timestamps: true })
export class Subscriber {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true }) email: string;
  @Prop({ default: '', trim: true }) name: string;
}
export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);

class SubscribeDto {
  @IsEmail({}, { message: 'Email inválido.' }) email: string;
  @IsOptional() @IsString() @MaxLength(150) name?: string;
}

@Injectable()
export class NewsletterService {
  constructor(@InjectModel(Subscriber.name) private readonly model: Model<SubscriberDocument>) {}
  async subscribe(dto: SubscribeDto) {
    const existing = await this.model.findOne({ email: dto.email.toLowerCase() }).exec();
    if (existing) throw new ConflictException('Este email já está subscrito.');
    return this.model.create({ email: dto.email.toLowerCase(), name: dto.name ?? '' });
  }
  findAll() { return this.model.find().sort({ createdAt: -1 }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly s: NewsletterService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  subscribe(@Body() dto: SubscribeDto) { return this.s.subscribe(dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  all() { return this.s.findAll(); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.s.remove(id); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/export')
  async export(@Res() res: Response) {
    const rows = await this.s.findAll();
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Email', 'Nome', 'Data'].join(','),
      ...rows.map((r) => [esc(r.email), esc(r.name), esc(new Date((r as any).createdAt).toLocaleString('pt-PT'))].join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="newsletter.csv"');
    res.send('﻿' + csv);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Subscriber.name, schema: SubscriberSchema }])],
  controllers: [NewsletterController],
  providers: [NewsletterService],
})
export class NewsletterModule {}
