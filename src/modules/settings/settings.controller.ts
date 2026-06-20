import { Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get()
  get() {
    return this.settingsService.get();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Put()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }
}
