import {
  Module, Injectable, Controller, Get, Post, Body, Query,
  UseInterceptors, UploadedFiles, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Asset, AssetSchema } from '../../common/schemas/asset.schema';
import { CloudinaryModule } from '../../cloudinary/cloudinary.module';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { UsersModule } from '../../users/users.module';
import { UsersService } from '../../users/users.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type UniversityListDocument = HydratedDocument<UniversityList>;

@Schema({ timestamps: true })
export class UniversityList {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) university: Types.ObjectId;
  @Prop({ required: true, trim: true }) universityName: string;
  @Prop({ required: true, trim: true }) year: string; // ano dos finalistas
  @Prop({ type: AssetSchema, required: true }) digitalPdf: Asset; // lista digital (PDF)
  @Prop({ type: AssetSchema, required: true }) signedScan: Asset; // documento assinado e digitalizado
  @Prop({ default: '', trim: true }) notes: string;
  @Prop({ default: '', trim: true }) submittedBy: string; // nome do responsável
  @Prop({ default: 'recebida', enum: ['recebida', 'em-verificacao', 'arquivada'], index: true }) status: string;
}
export const UniversityListSchema = SchemaFactory.createForClass(UniversityList);

class SubmitDto {
  @IsString() @MinLength(4) @MaxLength(20) year: string;
  @IsString() @MinLength(6) @MaxLength(6) identityCode: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@Injectable()
export class UniversityListsService {
  constructor(
    @InjectModel(UniversityList.name) private readonly model: Model<UniversityListDocument>,
    private readonly cloudinary: CloudinaryService,
    private readonly users: UsersService,
  ) {}

  private async upload(f: Express.Multer.File): Promise<Asset> {
    const up = f.mimetype === 'application/pdf'
      ? await this.cloudinary.uploadPdf(f, 'ormed/listas-universidades')
      : await this.cloudinary.uploadImage(f, 'ormed/listas-universidades');
    return { url: up.url, publicId: up.publicId };
  }

  async submit(actor: AuthUser, dto: SubmitDto, digital?: Express.Multer.File, signed?: Express.Multer.File) {
    const ok = await this.users.verifyIdentityCode(actor.userId, dto.identityCode);
    if (!ok) throw new ForbiddenException('Código de identidade inválido.');
    if (!digital || !signed) throw new BadRequestException('Anexe a lista digital (PDF) e o documento assinado digitalizado.');
    const me = await this.users.findById(actor.userId);
    const [digitalPdf, signedScan] = await Promise.all([this.upload(digital), this.upload(signed)]);
    return this.model.create({
      university: new Types.ObjectId(actor.userId),
      universityName: me?.universityName || me?.name || '',
      year: dto.year,
      digitalPdf,
      signedScan,
      notes: dto.notes ?? '',
      submittedBy: me?.name ?? '',
      status: 'recebida',
    });
  }

  /** Listas da própria universidade — requer o código de identidade para ver/imprimir. */
  async mine(actor: AuthUser, code: string) {
    const ok = await this.users.verifyIdentityCode(actor.userId, code);
    if (!ok) throw new ForbiddenException('Código de identidade inválido.');
    return this.model.find({ university: new Types.ObjectId(actor.userId) }).sort({ createdAt: -1 }).exec();
  }

  findAll() {
    return this.model.find().sort({ createdAt: -1 }).exec();
  }
}

@Controller('university-lists')
export class UniversityListsController {
  constructor(private readonly s: UniversityListsService) {}

  /** Submeter uma lista (universidade). */
  @Roles(UserRole.UNIVERSIDADE)
  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'digital', maxCount: 1 }, { name: 'signed', maxCount: 1 }]))
  submit(
    @Body() dto: SubmitDto,
    @UploadedFiles() files: { digital?: Express.Multer.File[]; signed?: Express.Multer.File[] },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.s.submit(actor, dto, files?.digital?.[0], files?.signed?.[0]);
  }

  /** Ver as próprias listas (universidade) — exige código de identidade. */
  @Roles(UserRole.UNIVERSIDADE)
  @Get('mine')
  mine(@Query('code') code: string, @CurrentUser() actor: AuthUser) {
    return this.s.mine(actor, code ?? '');
  }

  /** Ver todas as listas (Admin/Bastonária/funcionário com permissão). */
  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Get('admin/all')
  all() {
    return this.s.findAll();
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UniversityList.name, schema: UniversityListSchema }]),
    CloudinaryModule,
    UsersModule,
  ],
  controllers: [UniversityListsController],
  providers: [UniversityListsService],
})
export class UniversityListsModule {}
