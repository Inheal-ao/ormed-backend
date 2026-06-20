import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { PartnersService } from './partners.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Public()
  @Get()
  findPublished() {
    return this.partnersService.findPublished();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  findAllForAdmin() {
    return this.partnersService.findAllOrdered();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreatePartnerDto) {
    return this.partnersService.create(dto as Partial<any>);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.partnersService.remove(id);
  }
}
