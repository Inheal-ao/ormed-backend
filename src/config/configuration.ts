/**
 * Configuração central da aplicação, lida a partir das variáveis de ambiente.
 * É validada no arranque por `validateEnv` para falhar cedo se algo faltar.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  mongodbUri: string;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  mongodbUri: process.env.MONGODB_URI ?? '',
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
});

/**
 * Valida que as variáveis críticas existem antes do arranque.
 * Lança um erro claro em vez de falhar silenciosamente mais tarde.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !env[key] || String(env[key]).trim() === '');

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente em falta: ${missing.join(', ')}. ` +
        `Copie .env.example para .env e preencha os valores.`,
    );
  }

  if (String(env.JWT_SECRET).length < 24) {
    throw new Error('JWT_SECRET demasiado curto. Use pelo menos 24 caracteres aleatórios.');
  }

  return env;
}
