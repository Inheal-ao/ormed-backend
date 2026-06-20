import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Asset, AssetSchema } from '../../../common/schemas/asset.schema';

export type MagazineDocument = HydratedDocument<Magazine>;

/** Edição da Revista ORMED (ou boletim), com capa e ficheiro PDF. */
@Schema({ timestamps: true })
export class Magazine {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, trim: true, index: true })
  slug: string;

  @Prop({ default: '', trim: true })
  description: string;

  // Número da edição (ex.: "Nº 12") e ano de publicação
  @Prop({ default: '', trim: true })
  edition: string;

  @Prop({ type: Number, index: true })
  year: number;

  @Prop({ type: AssetSchema, default: null })
  coverImage: Asset | null;

  // PDF da revista (obrigatório para publicar)
  @Prop({ type: AssetSchema, default: null })
  pdf: Asset | null;

  @Prop({ default: false, index: true })
  isPublished: boolean;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;
}

export const MagazineSchema = SchemaFactory.createForClass(Magazine);
