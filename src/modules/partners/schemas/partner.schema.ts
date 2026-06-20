import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Asset, AssetSchema } from '../../../common/schemas/asset.schema';

export type PartnerDocument = HydratedDocument<Partner>;

/** Parceiro institucional (logo + link). */
@Schema({ timestamps: true })
export class Partner {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: AssetSchema, default: null })
  logo: Asset | null;

  @Prop({ default: '', trim: true })
  website: string;

  @Prop({ default: 0, index: true })
  order: number;

  @Prop({ default: true })
  isPublished: boolean;
}

export const PartnerSchema = SchemaFactory.createForClass(Partner);
