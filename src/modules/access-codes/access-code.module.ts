import {
  Module, Injectable, Controller, Get, Post, Param, Body, Query,
  ForbiddenException, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { createHash, randomInt } from 'crypto';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { UsersModule } from '../../users/users.module';
import { UsersService } from '../../users/users.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type AccessCodeDocument = HydratedDocument<AccessCode>;

/** Código de acesso de uso único (6 dígitos) atribuído a um utilizador. */
@Schema({ timestamps: true })
export class AccessCode {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) owner: Types.ObjectId;
  @Prop({ required: true }) ownerRole: string; // bastonaria | universidade
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) issuedBy: Types.ObjectId;
  @Prop({ required: true, index: true }) codeHash: string; // sha256 do código
  @Prop({ default: false, index: true }) isUsed: boolean;
  @Prop({ type: Date, default: null }) usedAt: Date | null;
  @Prop({ default: '' }) usedFor: string;
}
export const AccessCodeSchema = SchemaFactory.createForClass(AccessCode);

const sha = (code: string) => createHash('sha256').update(String(code).trim()).digest('hex');

class GenerateDto {
  @IsString() targetUserId: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) count?: number;
}

@Injectable()
export class AccessCodesService {
  constructor(
    @InjectModel(AccessCode.name) private readonly model: Model<AccessCodeDocument>,
    private readonly users: UsersService,
  ) {}

  /** Gera um bloco de códigos de uso único para um utilizador (devolve-os em claro uma vez). */
  async generate(issuer: AuthUser, targetUserId: string, count = 50): Promise<string[]> {
    const target = await this.users.findById(targetUserId);
    if (!target) throw new NotFoundException('Utilizador não encontrado.');

    // Regras: Admin gera para bastonária/universidade; Bastonária só para universidade.
    const isGod = issuer.role === UserRole.SUPER_ADMIN;
    const isBast = issuer.role === UserRole.BASTONARIA;
    const ok =
      (isGod && (target.role === UserRole.BASTONARIA || target.role === UserRole.UNIVERSIDADE)) ||
      (isBast && target.role === UserRole.UNIVERSIDADE);
    if (!ok) throw new ForbiddenException('Sem permissão para gerar códigos para este perfil.');

    const codes: string[] = [];
    const docs: Partial<AccessCode>[] = [];
    const seen = new Set<string>();
    while (codes.length < count) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
      docs.push({
        owner: new Types.ObjectId(targetUserId),
        ownerRole: target.role,
        issuedBy: new Types.ObjectId(issuer.userId),
        codeHash: sha(code),
        isUsed: false,
      });
    }
    await this.model.insertMany(docs);
    return codes;
  }

  /** Consome (uso único, atómico) um código do utilizador. Lança erro se inválido. */
  async consume(ownerUserId: string, code: string, usedFor: string): Promise<void> {
    if (!code || !/^\d{6}$/.test(String(code).trim())) {
      throw new ForbiddenException('Código de acesso inválido.');
    }
    const used = await this.model.findOneAndUpdate(
      { owner: new Types.ObjectId(ownerUserId), codeHash: sha(code), isUsed: false },
      { isUsed: true, usedAt: new Date(), usedFor },
      { new: true },
    ).exec();
    if (!used) throw new ForbiddenException('Código de acesso inválido ou já utilizado.');
  }

  async stats(ownerUserId: string) {
    const owner = new Types.ObjectId(ownerUserId);
    const [total, unused] = await Promise.all([
      this.model.countDocuments({ owner }),
      this.model.countDocuments({ owner, isUsed: false }),
    ]);
    return { total, unused, used: total - unused };
  }
}

@Controller('access-codes')
export class AccessCodesController {
  constructor(private readonly s: AccessCodesService) {}

  /** Gerar bloco de códigos (Admin → bastonária/universidade; Bastonária → universidade). */
  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA)
  @Post('generate')
  async generate(@Body() dto: GenerateDto, @CurrentUser() actor: AuthUser) {
    const codes = await this.s.generate(actor, dto.targetUserId, dto.count ?? 50);
    const stats = await this.s.stats(dto.targetUserId);
    return { codes, stats };
  }

  /** Quantos códigos restam a um utilizador (para o gestor). */
  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA)
  @Get('stats/:userId')
  stats(@Param('userId') userId: string) {
    return this.s.stats(userId);
  }

  /** O próprio vê quantos códigos ainda tem. */
  @Get('mine/stats')
  mineStats(@CurrentUser() actor: AuthUser) {
    return this.s.stats(actor.userId);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AccessCode.name, schema: AccessCodeSchema }]),
    UsersModule,
  ],
  controllers: [AccessCodesController],
  providers: [AccessCodesService],
  exports: [AccessCodesService],
})
export class AccessCodesModule {}
