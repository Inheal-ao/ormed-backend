import {
  Module, Injectable, Controller, Get, Post, Patch, Delete, Param, Body, Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type SupportDocument = HydratedDocument<ResearchSupport>;

/** Pedido de apoio à pesquisa científica submetido pelo público. */
@Schema({ timestamps: true })
export class ResearchSupport {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true, lowercase: true }) email: string;
  @Prop({ default: '', trim: true }) phone: string;
  @Prop({ default: '', trim: true }) supportType: string; // tipo de apoio
  @Prop({ required: true }) message: string;
  @Prop({ default: 'new', enum: ['new', 'handled'], index: true }) status: string;
}
export const SupportSchema = SchemaFactory.createForClass(ResearchSupport);

class CreateSupportDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) supportType?: string;
  @IsString() @MinLength(5) @MaxLength(3000) message: string;
}
class UpdateStatusDto {
  @IsIn(['new', 'handled']) status: string;
}

@Injectable()
export class ResearchSupportService {
  constructor(@InjectModel(ResearchSupport.name) private readonly model: Model<SupportDocument>) {}
  create(dto: CreateSupportDto) { return this.model.create(dto); }
  findAll() { return this.model.find().sort({ createdAt: -1 }).exec(); }
  updateStatus(id: string, status: string) { return this.model.findByIdAndUpdate(id, { status }, { new: true }).exec(); }
  remove(id: string) { return this.model.findByIdAndDelete(id).exec(); }
}

@Controller('research-support')
export class ResearchSupportController {
  constructor(private readonly s: ResearchSupportService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateSupportDto) { return this.s.create(dto); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  all() { return this.s.findAll(); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id/status')
  status(@Param('id') id: string, @Body() dto: UpdateStatusDto) { return this.s.updateStatus(id, dto.status); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.s.remove(id); }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/export')
  async export(@Res() res: Response) {
    const rows = await this.s.findAll();
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Nome', 'Email', 'Telefone', 'Tipo de apoio', 'Mensagem', 'Estado', 'Data'].join(','),
      ...rows.map((r) =>
        [esc(r.name), esc(r.email), esc(r.phone), esc(r.supportType), esc(r.message), esc(r.status), esc(new Date((r as any).createdAt).toLocaleString('pt-PT'))].join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="apoio-pesquisa.csv"');
    res.send('﻿' + csv);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: ResearchSupport.name, schema: SupportSchema }])],
  controllers: [ResearchSupportController],
  providers: [ResearchSupportService],
})
export class ResearchSupportModule {}
