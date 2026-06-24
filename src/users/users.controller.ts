import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { UserRole } from './schemas/user.schema';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';

// Password forte obrigatória: mín. 8, com maiúscula, minúscula, número e símbolo.
const STRONG_PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const STRONG_PW_MSG = 'A password deve ter no mínimo 8 caracteres, incluindo maiúscula, minúscula, número e símbolo.';

// ===== DTOs =====
class CreateStaffDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsEmail() email: string;
  @IsString() @MaxLength(100) @Matches(STRONG_PW,{message:STRONG_PW_MSG}) password: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}
class CreateUniversityDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsEmail() email: string;
  @IsString() @MaxLength(100) @Matches(STRONG_PW,{message:STRONG_PW_MSG}) password: string;
  @IsString() @MinLength(2) @MaxLength(200) universityName: string;
  @IsIn(['reitor', 'decano', 'diretor', 'presidente']) responsibleType: string;
  @IsOptional() @IsIn(['universidade', 'ies', 'inaarees']) institutionType?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
class CreateColegioDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsEmail() email: string;
  @IsString() @MaxLength(100) @Matches(STRONG_PW, { message: STRONG_PW_MSG }) password: string;
  @IsString() @MinLength(2) @MaxLength(60) collegeId: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsString() @MaxLength(200) universityName?: string;
  @IsOptional() @IsIn(['reitor', 'decano', 'diretor', 'presidente', '']) responsibleType?: string;
  @IsOptional() @IsIn(['universidade', 'ies', 'inaarees']) institutionType?: string;
  @IsOptional() @IsString() @MaxLength(60) collegeId?: string;
}
class BlockDto {
  @IsOptional() blocked?: boolean;
}
class SetPasswordDto {
  @IsString() @MaxLength(100) @Matches(STRONG_PW,{message:STRONG_PW_MSG}) password: string;
}

function sanitize(u: any) {
  return {
    _id: u._id, name: u.name, email: u.email, role: u.role,
    permissions: u.permissions ?? [], universityName: u.universityName ?? '',
    responsibleType: u.responsibleType ?? '', institutionType: u.institutionType ?? 'universidade',
    phone: u.phone ?? '', collegeId: u.collegeId ?? '',
    isActive: u.isActive, isBlocked: u.isBlocked, lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/** Gestão de utilizadores (Admin/deus e Bastonária). */
@Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  private isGod(actor: AuthUser) {
    return actor.role === UserRole.SUPER_ADMIN;
  }
  /** Bastonária só gere funcionários e universidades; Admin gere tudo. */
  private assertManage(actor: AuthUser, targetRole: string) {
    if (this.isGod(actor)) return;
    if (actor.role === UserRole.BASTONARIA && (targetRole === UserRole.FUNCIONARIO || targetRole === UserRole.UNIVERSIDADE || targetRole === UserRole.COLEGIO)) return;
    throw new ForbiddenException('Sem permissão para gerir este perfil.');
  }

  @Get()
  async list(@Query('role') role?: string) {
    const all = await this.users.findByRole(role as UserRole);
    return all.map(sanitize);
  }

  /** Criar Bastonária — apenas o Admin (deus). */
  @Post('bastonaria')
  async createBastonaria(@Body() dto: CreateStaffDto, @CurrentUser() actor: AuthUser) {
    if (!this.isGod(actor)) throw new ForbiddenException('Apenas o Administrador pode criar bastonárias.');
    const u = await this.users.create({ ...dto, role: UserRole.BASTONARIA });
    return sanitize(u);
  }

  /** Criar funcionário com permissões. */
  @Post('funcionario')
  async createFuncionario(@Body() dto: CreateStaffDto) {
    const u = await this.users.create({ ...dto, role: UserRole.FUNCIONARIO, permissions: dto.permissions ?? [] });
    return sanitize(u);
  }

  /** Criar gestor de um colégio de especialidade. */
  @Post('colegio')
  async createColegio(@Body() dto: CreateColegioDto) {
    const u = await this.users.create({
      name: dto.name, email: dto.email, password: dto.password, phone: dto.phone,
      role: UserRole.COLEGIO, collegeId: dto.collegeId,
    });
    return sanitize(u);
  }

  /** Criar responsável de universidade. Os códigos de acesso geram-se à parte (bloco de 50). */
  @Post('universidade')
  async createUniversidade(@Body() dto: CreateUniversityDto) {
    const u = await this.users.create({
      name: dto.name, email: dto.email, password: dto.password, phone: dto.phone,
      role: UserRole.UNIVERSIDADE, universityName: dto.universityName, responsibleType: dto.responsibleType,
      institutionType: dto.institutionType ?? 'universidade',
    });
    return sanitize(u);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    const target = await this.users.findById(id);
    if (!target) throw new ForbiddenException('Utilizador não encontrado.');
    this.assertManage(actor, target.role);
    return sanitize(await this.users.updateInfo(id, dto));
  }

  @Patch(':id/block')
  async block(@Param('id') id: string, @Body() dto: BlockDto, @CurrentUser() actor: AuthUser) {
    const target = await this.users.findById(id);
    if (!target) throw new ForbiddenException('Utilizador não encontrado.');
    this.assertManage(actor, target.role);
    if ((target as any)._id.toString() === actor.userId) throw new BadRequestException('Não pode bloquear-se a si próprio.');
    return sanitize(await this.users.setBlocked(id, dto.blocked !== false));
  }

  @Post(':id/password')
  async setPassword(@Param('id') id: string, @Body() dto: SetPasswordDto, @CurrentUser() actor: AuthUser) {
    const target = await this.users.findById(id);
    if (!target) throw new ForbiddenException('Utilizador não encontrado.');
    this.assertManage(actor, target.role);
    await this.users.adminSetPassword(id, dto.password);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const target = await this.users.findById(id);
    if (!target) throw new ForbiddenException('Utilizador não encontrado.');
    if ((target as any)._id.toString() === actor.userId) throw new BadRequestException('Não pode eliminar-se a si próprio.');
    this.assertManage(actor, target.role);
    await this.users.remove(id);
    return { ok: true };
  }
}

// ===== Perfil próprio (qualquer utilizador autenticado) =====
class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword: string;
  @IsString() @MaxLength(100) @Matches(STRONG_PW,{message:STRONG_PW_MSG}) newPassword: string;
}

@Controller('profile')
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() actor: AuthUser) {
    const u = await this.users.findById(actor.userId);
    if (!u) throw new ForbiddenException('Sessão inválida.');
    return sanitize(u);
  }

  @Patch('password')
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() actor: AuthUser) {
    await this.users.changeOwnPassword(actor.userId, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }
}
