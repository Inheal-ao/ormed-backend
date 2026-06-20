import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StatDocument = HydratedDocument<Stat>;

/** Indicador mostrado na homepage (ex.: "12.500+ Médicos Inscritos"). */
@Schema({ timestamps: true })
export class Stat {
  @Prop({ required: true, trim: true })
  value: string; // ex.: "12.500+"

  @Prop({ required: true, trim: true })
  label: string; // ex.: "Médicos Inscritos"

  // Nome do ícone (lucide-react): Calendar, Users, MapPin, Heart, etc.
  @Prop({ default: 'Activity', trim: true })
  icon: string;

  @Prop({ default: 0, index: true })
  order: number;

  @Prop({ default: true })
  isPublished: boolean;
}

export const StatSchema = SchemaFactory.createForClass(Stat);
