import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ===== Segurança de cabeçalhos HTTP =====
  app.use(helmet());

  // ===== CORS restrito às origens conhecidas =====
  const corsOrigins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ===== Prefixo global da API =====
  app.setGlobalPrefix('api');

  // ===== Validação e sanitização automática de DTOs =====
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove propriedades não declaradas no DTO
      forbidNonWhitelisted: true, // rejeita payloads com campos extra
      transform: true, // converte tipos (ex.: string -> number)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Encerramento gracioso (fecha ligações ao MongoDB, etc.)
  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);
  logger.log(`API ORMED a correr em http://localhost:${port}/api`);
}

bootstrap();
