import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Asset, AssetSchema } from '../../../common/schemas/asset.schema';

export type BastonarioDocument = HydratedDocument<Bastonario>;

/** Bastonário (atual ou antigo presidente da Ordem). */
@Schema({ timestamps: true })
export class Bastonario {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: AssetSchema, default: null })
  photo: Asset | null;

  // Período do mandato, ex.: "2015 - 2020"
  @Prop({ default: '', trim: true })
  mandate: string;

  @Prop({ default: '' })
  bio: string;

  // Indica o bastonário em exercício
  @Prop({ default: false })
  isCurrent: boolean;

  // Ordem de apresentação na lista
  @Prop({ default: 0, index: true })
  order: number;

  @Prop({ default: true })
  isPublished: boolean;
}

export const BastonarioSchema = SchemaFactory.createForClass(Bastonario);
