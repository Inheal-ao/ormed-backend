import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UPLOAD_LIMITS } from '../common/upload-limits';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

/**
 * Endpoints de upload. Protegidos: apenas admins/editores autenticados.
 * Devolvem a URL do asset para guardar nos documentos de conteúdo.
 */
@Controller('uploads')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
export class UploadsController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMITS))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum ficheiro enviado.');
    return this.cloudinary.uploadImage(file);
  }

  @Post('pdf')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMITS))
  async uploadPdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum ficheiro enviado.');
    return this.cloudinary.uploadPdf(file);
  }
}
