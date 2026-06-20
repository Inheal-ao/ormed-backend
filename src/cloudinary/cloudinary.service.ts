import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { v2 as CloudinaryType, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';
import { CLOUDINARY } from './cloudinary.provider';

export interface UploadedAsset {
  url: string;
  publicId: string;
  format: string;
  bytes: number;
  resourceType: string;
}

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const PDF_MIME = ['application/pdf'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class CloudinaryService {
  constructor(@Inject(CLOUDINARY) private readonly cloudinary: typeof CloudinaryType) {}

  /** Faz upload de uma imagem validando tipo e tamanho. */
  uploadImage(file: Express.Multer.File, folder = 'ormed/images'): Promise<UploadedAsset> {
    if (!IMAGE_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Formato de imagem inválido. Use JPG, PNG, WEBP, GIF ou SVG.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Imagem demasiado grande (máx. 8 MB).');
    }
    return this.upload(file, folder, 'image');
  }

  /** Faz upload de um PDF (revistas, boletins) validando tipo e tamanho. */
  uploadPdf(file: Express.Multer.File, folder = 'ormed/pdfs'): Promise<UploadedAsset> {
    if (!PDF_MIME.includes(file.mimetype)) {
      throw new BadRequestException('O ficheiro deve ser um PDF.');
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new BadRequestException('PDF demasiado grande (máx. 50 MB).');
    }
    return this.upload(file, folder, 'raw');
  }

  /** Remove um asset do Cloudinary pelo seu publicId. */
  async remove(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
    if (!publicId) return;
    await this.cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }

  private upload(
    file: Express.Multer.File,
    folder: string,
    resourceType: 'image' | 'raw',
  ): Promise<UploadedAsset> {
    // Para PDFs (raw), garantir que o public_id termina em ".pdf" para que
    // o link entregue seja reconhecido pelo browser como um PDF.
    const options: Record<string, unknown> = { folder, resource_type: resourceType };
    if (resourceType === 'raw') {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      options.public_id = `${unique}.pdf`;
      options.use_filename = false;
      options.unique_filename = false;
    }
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        options,
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            return reject(new BadRequestException('Falha no upload do ficheiro.'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format ?? '',
            bytes: result.bytes,
            resourceType: result.resource_type,
          });
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
