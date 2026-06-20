import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/schemas/user.schema';

export const ROLES_KEY = 'roles';

/** Restringe uma rota aos papéis indicados. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
