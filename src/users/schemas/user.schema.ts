import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

/** Níveis de acesso do painel admin. */
export enum UserRole {
  SUPER_ADMIN = 'super_admin', // controlo total, incluindo gestão de outros admins
  ADMIN = 'admin', // gestão de todo o conteúdo
  EDITOR = 'editor', // criação/edição de conteúdo, sem gestão de utilizadores
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  // Hash bcrypt. `select: false` impede que seja devolvido por defeito nas queries.
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.EDITOR,
  })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  // Hash do refresh token atualmente válido (rotação de tokens). `select: false`.
  @Prop({ type: String, default: null, select: false })
  refreshTokenHash: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
