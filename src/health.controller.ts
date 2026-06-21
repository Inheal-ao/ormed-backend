import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class HealthController {
  // Raiz "/" — responde 200 para monitorização (ex.: UptimeRobot na raiz)
  @Public()
  @Get()
  root() {
    return { status: 'ok', service: 'ormed-backend' };
  }

  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'ormed-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
