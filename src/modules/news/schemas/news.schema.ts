import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Asset, AssetSchema } from '../../../common/schemas/asset.schema';

export type NewsDocument = HydratedDocument<News>;

@Schema({ timestamps: true })
export class News {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, trim: true, index: true })
  slug: string;

  // Subtítulo (hierarquia: título > subtítulo)
  @Prop({ default: '', trim: true })
  subtitle: string;

  @Prop({ default: '', trim: true })
  excerpt: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ type: AssetSchema, default: null })
  coverImage: Asset | null;

  // Galeria de fotos adicionais (carrossel)
  @Prop({ type: [AssetSchema], default: [] })
  images: Asset[];

  // Fonte da notícia (ex.: "Jornal de Angola", URL, etc.)
  @Prop({ default: '', trim: true })
  source: string;

  @Prop({ default: 'Geral', trim: true, index: true })
  category: string;

  @Prop({ default: 'ORMED', trim: true })
  author: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: false, index: true })
  isPublished: boolean;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;
}

export const NewsSchema = SchemaFactory.createForClass(News);
