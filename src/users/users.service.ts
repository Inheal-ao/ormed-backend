import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { User, UserDocument, UserRole } from './schemas/user.schema';

const BCRYPT_ROUNDS = 12;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  permissions?: string[];
  universityName?: string;
  responsibleType?: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** Cria um novo utilizador com a password já encriptada. */
  async create(input: CreateUserInput): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ email: input.email.toLowerCase() });
    if (existing) {
      throw new ConflictException('Já existe um utilizador com este email.');
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = new this.userModel({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role ?? UserRole.FUNCIONARIO,
      permissions: input.permissions ?? [],
      universityName: input.universityName ?? '',
      responsibleType: input.responsibleType ?? '',
      phone: input.phone ?? '',
    });
    return user.save();
  }

  findByEmailWithSecret(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash +refreshTokenHash')
      .exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  findByIdWithRefresh(id: string) {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }

  findAll() {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  findByRole(role?: UserRole) {
    const filter = role ? { role } : {};
    return this.userModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { refreshTokenHash: hash }).exec();
  }

  async markLogin(id: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { lastLoginAt: new Date() }).exec();
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, BCRYPT_ROUNDS);
  }

  async verifyTokenHash(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  async setActive(id: string, isActive: boolean): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    return user;
  }

  // ===== Gestão de utilizadores =====

  /** Atualiza dados de perfil (nome, telefone, permissões, dados da universidade). */
  async updateInfo(
    id: string,
    patch: Partial<Pick<User, 'name' | 'phone' | 'permissions' | 'universityName' | 'responsibleType'>>,
  ): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(id, patch, { new: true }).exec();
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    return user;
  }

  async setBlocked(id: string, isBlocked: boolean): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(id, { isBlocked }, { new: true }).exec();
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    // Bloquear também invalida a sessão atual.
    if (isBlocked) await this.setRefreshTokenHash(id, null);
    return user;
  }

  async remove(id: string): Promise<void> {
    const res = await this.userModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Utilizador não encontrado.');
  }

  /** Mudança da própria password (verifica a atual). */
  async changeOwnPassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findById(id).select('+passwordHash').exec();
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Password atual incorreta.');
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();
  }

  /** Reposição de password por um administrador/bastonária. */
  async adminSetPassword(id: string, newPassword: string): Promise<void> {
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const res = await this.userModel.findByIdAndUpdate(id, { passwordHash: hash, refreshTokenHash: null }).exec();
    if (!res) throw new NotFoundException('Utilizador não encontrado.');
  }

  // ===== Código de identidade (6 dígitos) =====

  /** Gera e guarda (cifrado) um novo código de identidade. Devolve o código em claro (uma vez). */
  async generateIdentityCode(id: string): Promise<string> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    user.identityCodeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    await user.save();
    return code;
  }

  /** Verifica o código de identidade do próprio utilizador. */
  async verifyIdentityCode(id: string, code: string): Promise<boolean> {
    const user = await this.userModel.findById(id).select('+identityCodeHash').exec();
    if (!user || !user.identityCodeHash) return false;
    return bcrypt.compare(String(code).trim(), user.identityCodeHash);
  }
}
