import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { AuthUser } from '../decorators/current-user.decorator';

/** Verifica se o utilizador autenticado possui um dos papéis exigidos. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!user) {
      throw new ForbiddenException('Não tem permissões para esta ação.');
    }
    // Acesso total: Admin (deus) e Bastonária passam em qualquer verificação de papel.
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.BASTONARIA) {
      return true;
    }
    // Funcionário é equivalente a Editor nas rotas de conteúdo (limitação fina via menu).
    if (user.role === UserRole.FUNCIONARIO && requiredRoles.includes(UserRole.EDITOR)) {
      return true;
    }
    if (!requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('Não tem permissões para esta ação.');
    }
    return true;
  }
}
