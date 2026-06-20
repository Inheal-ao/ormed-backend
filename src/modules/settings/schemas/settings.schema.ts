import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SettingsDocument = HydratedDocument<Settings>;

/** Configurações globais do site (documento único / singleton). */
@Schema({ timestamps: true })
export class Settings {
  // Chave fixa para garantir um único documento
  @Prop({ default: 'global', unique: true, index: true })
  key: string;

  @Prop({ default: '+244 222 000 000', trim: true })
  phone: string;

  @Prop({ default: 'geral@ordemdosmedicos.ao', trim: true })
  email: string;

  @Prop({ default: 'Luanda, Angola', trim: true })
  address: string;

  @Prop({ default: '', trim: true })
  facebook: string;

  @Prop({ default: '', trim: true })
  instagram: string;

  @Prop({ default: '', trim: true })
  linkedin: string;

  @Prop({ default: '', trim: true })
  youtube: string;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
