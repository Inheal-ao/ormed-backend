/**
 * Cria o primeiro utilizador SUPER_ADMIN a partir das variáveis SEED_ADMIN_*.
 * Uso: npm run seed:admin
 * Idempotente — se o email já existir, não faz nada.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';

async function run() {
  const logger = new Logger('SeedAdmin');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const usersService = app.get(UsersService);

    const name = process.env.SEED_ADMIN_NAME ?? 'Administrador ORMED';
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env');
    }

    const existing = await usersService.findByEmailWithSecret(email);
    if (existing) {
      logger.log(`Admin já existe (${email}). Nada a fazer.`);
      return;
    }

    await usersService.create({ name, email, password, role: UserRole.SUPER_ADMIN });
    logger.log(`Super admin criado: ${email}`);
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Falha no seed do admin:', err.message);
  process.exit(1);
});
