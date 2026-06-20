import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Referência a um ficheiro alojado no Cloudinary (imagem ou PDF). */
@Schema({ _id: false })
export class Asset {
  @Prop({ required: true })
  url: string;

  @Prop({ default: '' })
  publicId: string;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
