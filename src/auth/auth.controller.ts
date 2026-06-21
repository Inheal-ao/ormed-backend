import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  // Limite apertado contra força bruta: 5 tentativas por minuto.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Req() req: Request) {
    const user = req.user as AuthUser & { refreshToken: string };
    return this.authService.refresh(user.userId, user.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser('userId') userId: string) {
    await this.authService.logout(userId);
  }

  /** Devolve os dados do utilizador autenticado. */
  @Get('me')
  async me(@CurrentUser('userId') userId: string) {
    const user = await this.usersService.findById(userId);
    return {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      role: user?.role,
      permissions: user?.permissions ?? [],
      universityName: user?.universityName ?? '',
      responsibleType: user?.responsibleType ?? '',
      lastLoginAt: user?.lastLoginAt,
    };
  }
}
