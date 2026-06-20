import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { UserRole } from './schemas/user.schema';

/**
 * Cria automaticamente o primeiro super admin no arranque, se ainda não existir.
 * Idempotente: se o utilizador já existe, não faz nada.
 * Útil em hosts sem acesso a terminal (ex.: Render free tier).
 */
@Injectable()
export class AdminSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AdminSeeder');

  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const name = process.env.SEED_ADMIN_NAME ?? 'Administrador ORMED';
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.warn('SEED_ADMIN_EMAIL/PASSWORD não definidos — admin não criado.');
      return;
    }

    try {
      const existing = await this.usersService.findByEmailWithSecret(email);
      if (existing) {
        this.logger.log(`Admin já existe (${email}).`);
        return;
      }
      await this.usersService.create({ name, email, password, role: UserRole.SUPER_ADMIN });
      this.logger.log(`Super admin criado automaticamente: ${email}`);
    } catch (err) {
      this.logger.error(
        `Falha ao criar admin automaticamente: ${(err as Error).message}`,
      );
    }
  }
}
