import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { mongoSanitize } from './common/security/sanitize.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Confiar no proxy do host (Render) para obter o IP real do cliente
  // (essencial para o rate limiting funcionar por IP).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Esconde a tecnologia usada
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // ===== Segurança de cabeçalhos HTTP (Helmet) =====
  app.use(
    helmet({
      contentSecurityPolicy: false, // a API serve JSON; CSP é aplicada no frontend
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    }),
  );

  // ===== Anti-injeção NoSQL =====
  app.use(mongoSanitize);

  // ===== CORS restrito às origens conhecidas =====
  const corsOrigins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  });

  // ===== Prefixo global da API (raiz "/" fica de fora, para monitorização) =====
  app.setGlobalPrefix('api', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });

  // ===== Validação e sanitização automática de DTOs =====
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove propriedades não declaradas no DTO
      forbidNonWhitelisted: true, // rejeita payloads com campos extra
      transform: true, // converte tipos (ex.: string -> number)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);
  logger.log(`API ORMED a correr em http://localhost:${port}/api`);
}

bootstrap();
