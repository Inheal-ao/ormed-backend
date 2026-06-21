import {
  Module, Injectable, Controller, Get, Post, Body,
  UseInterceptors, UploadedFiles, BadRequestException,
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
import { AccessCodesModule } from '../access-codes/access-code.module';
import { AccessCodesService } from '../access-codes/access-code.module';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';

export type UniversityListDocument = HydratedDocument<UniversityList>;

@Schema({ timestamps: true })
export class UniversityList {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) university: Types.ObjectId;
  @Prop({ required: true, trim: true }) universityName: string;
  @Prop({ required: true, trim: true }) year: string; // ano académico dos finalistas
  @Prop({ type: AssetSchema, required: true }) digitalPdf: Asset; // lista digital (PDF)
  @Prop({ type: AssetSchema, required: true }) signedScan: Asset; // documento assinado e digitalizado
  @Prop({ default: '', trim: true }) notes: string;
  @Prop({ default: '', trim: true }) submittedBy: string;
  @Prop({ default: 'recebida', enum: ['recebida', 'em-verificacao', 'arquivada'], index: true }) status: string;
}
export const UniversityListSchema = SchemaFactory.createForClass(UniversityList);

class SubmitDto {
  @IsString() @MinLength(4) @MaxLength(20) year: string;
  @IsString() @MinLength(6) @MaxLength(6) code: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class CodeDto {
  @IsString() @MinLength(6) @MaxLength(6) code: string;
}
class AdminViewDto {
  @IsOptional() @IsString() @MaxLength(6) code?: string;
}

@Injectable()
export class UniversityListsService {
  constructor(
    @InjectModel(UniversityList.name) private readonly model: Model<UniversityListDocument>,
    private readonly cloudinary: CloudinaryService,
    private readonly users: UsersService,
    private readonly codes: AccessCodesService,
  ) {}

  private async upload(f: Express.Multer.File): Promise<Asset> {
    const up = f.mimetype === 'application/pdf'
      ? await this.cloudinary.uploadPdf(f, 'ormed/listas-universidades')
      : await this.cloudinary.uploadImage(f, 'ormed/listas-universidades');
    return { url: up.url, publicId: up.publicId };
  }

  async submit(actor: AuthUser, dto: SubmitDto, digital?: Express.Multer.File, signed?: Express.Multer.File) {
    if (!digital || !signed) throw new BadRequestException('Anexe a lista digital (PDF) e o documento assinado digitalizado.');
    await this.codes.consume(actor.userId, dto.code, 'enviar-lista'); // uso único
    const me = await this.users.findById(actor.userId);
    const [digitalPdf, signedScan] = await Promise.all([this.upload(digital), this.upload(signed)]);
    return this.model.create({
      university: new Types.ObjectId(actor.userId),
      universityName: me?.universityName || me?.name || '',
      year: dto.year,
      digitalPdf, signedScan,
      notes: dto.notes ?? '',
      submittedBy: me?.name ?? '',
      status: 'recebida',
    });
  }

  /** Universidade vê/imprime as suas listas — consome um código de uso único. */
  async unlockMine(actor: AuthUser, code: string) {
    await this.codes.consume(actor.userId, code, 'ver-listas');
    return this.model.find({ university: new Types.ObjectId(actor.userId) }).sort({ createdAt: -1 }).exec();
  }

  /** Admin/Bastonária veem todas. Bastonária consome um código; Admin (deus) é isento. */
  async adminView(actor: AuthUser, code?: string) {
    if (actor.role === UserRole.BASTONARIA) {
      await this.codes.consume(actor.userId, code ?? '', 'ver-listas-todas');
    }
    return this.model.find().sort({ createdAt: -1 }).exec();
  }
}

@Controller('university-lists')
export class UniversityListsController {
  constructor(private readonly s: UniversityListsService) {}

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

  @Roles(UserRole.UNIVERSIDADE)
  @Post('mine/unlock')
  mine(@Body() dto: CodeDto, @CurrentUser() actor: AuthUser) {
    return this.s.unlockMine(actor, dto.code);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Post('admin/view')
  all(@Body() dto: AdminViewDto, @CurrentUser() actor: AuthUser) {
    return this.s.adminView(actor, dto.code);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UniversityList.name, schema: UniversityListSchema }]),
    CloudinaryModule,
    UsersModule,
    AccessCodesModule,
  ],
  controllers: [UniversityListsController],
  providers: [UniversityListsService],
})
export class UniversityListsModule {}
