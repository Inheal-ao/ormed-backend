import {
  Module, Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';

export const REQUIRE_CAPTCHA = 'require_captcha';
/** Marca um endpoint como exigindo verificação anti-spam (Turnstile). */
export const RequireCaptcha = () => SetMetadata(REQUIRE_CAPTCHA, true);

@Injectable()
export class CaptchaService {
  private readonly secret = process.env.TURNSTILE_SECRET_KEY || '';

  /** Só está ativo quando a chave secreta estiver configurada. */
  get enabled(): boolean {
    return !!this.secret;
  }

  async verify(token: string, ip?: string): Promise<boolean> {
    if (!this.secret) return true; // desativado -> não bloqueia
    if (!token) return false;
    try {
      const body = new URLSearchParams();
      body.append('secret', this.secret);
      body.append('response', token);
      if (ip) body.append('remoteip', ip);
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
      });
      const data = (await res.json()) as { success?: boolean };
      return !!data.success;
    } catch {
      return false;
    }
  }
}

@Injectable()
export class TurnstileGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly captcha: CaptchaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_CAPTCHA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || !this.captcha.enabled) return true;

    const req = context.switchToHttp().getRequest<{ headers: Record<string, any>; ip?: string }>();
    const token = req.headers['x-captcha-token'] || req.headers['cf-turnstile-response'] || '';
    const ok = await this.captcha.verify(String(token), req.ip);
    if (!ok) throw new ForbiddenException('Verificação anti-spam falhou. Atualize a página e tente novamente.');
    return true;
  }
}

@Module({
  providers: [
    CaptchaService,
    { provide: APP_GUARD, useClass: TurnstileGuard },
  ],
  exports: [CaptchaService],
})
export class CaptchaModule {}
