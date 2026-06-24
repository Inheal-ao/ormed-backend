import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

/** Perfis de acesso da plataforma. */
export enum UserRole {
  SUPER_ADMIN = 'super_admin', // Admin "deus" — todos os acessos, cria bastonárias
  ADMIN = 'admin', // legado (acesso elevado)
  EDITOR = 'editor', // legado
  BASTONARIA = 'bastonaria', // acesso total + gere funcionários e universidades
  FUNCIONARIO = 'funcionario', // acesso às secções permitidas
  UNIVERSIDADE = 'universidade', // só o portal de listas de finalistas
  COLEGIO = 'colegio', // gestão de um colégio de especialidade (internos, programas, notas)
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

  @Prop({ type: String, enum: UserRole, default: UserRole.FUNCIONARIO })
  role: UserRole;

  // Funcionário: secções do painel a que tem acesso (ex.: 'noticias', 'eventos').
  @Prop({ type: [String], default: [] })
  permissions: string[];

  // Universidade: dados do responsável.
  @Prop({ default: '', trim: true })
  universityName: string;

  @Prop({ default: '', trim: true })
  responsibleType: string; // 'reitor' | 'decano'

  @Prop({ default: '', trim: true })
  phone: string;

  // Colégio: id do colégio de especialidade que este utilizador gere.
  @Prop({ default: '', trim: true })
  collegeId: string;

  @Prop({ default: true })
  isActive: boolean;

  // Bloqueio sem eliminar (impede login).
  @Prop({ default: false })
  isBlocked: boolean;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  // Hash do refresh token atualmente válido (rotação de tokens). `select: false`.
  @Prop({ type: String, default: null, select: false })
  refreshTokenHash: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
