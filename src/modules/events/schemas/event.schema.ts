import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Asset, AssetSchema } from '../../../common/schemas/asset.schema';

export type EventDocument = HydratedDocument<Event>;

@Schema({ timestamps: true })
export class Event {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, trim: true, index: true })
  slug: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ type: AssetSchema, default: null })
  coverImage: Asset | null;

  @Prop({ default: '', trim: true })
  location: string;

  @Prop({ type: Date, required: true, index: true })
  startDate: Date;

  @Prop({ type: Date, default: null })
  endDate: Date | null;

  @Prop({ default: false, index: true })
  isPublished: boolean;
}

export const EventSchema = SchemaFactory.createForClass(Event);
