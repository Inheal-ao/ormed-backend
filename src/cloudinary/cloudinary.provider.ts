import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY = 'CLOUDINARY';

/** Configura o SDK do Cloudinary com as credenciais do ambiente. */
export const CloudinaryProvider: Provider = {
  provide: CLOUDINARY,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    cloudinary.config({
      cloud_name: config.get<string>('cloudinary.cloudName'),
      api_key: config.get<string>('cloudinary.apiKey'),
      api_secret: config.get<string>('cloudinary.apiSecret'),
      secure: true,
    });
    return cloudinary;
  },
};
