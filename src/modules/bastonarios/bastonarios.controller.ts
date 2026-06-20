import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { BastonariosService } from './bastonarios.service';
import { CreateBastonarioDto, UpdateBastonarioDto } from './dto/bastonario.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('bastonarios')
export class BastonariosController {
  constructor(private readonly bastonariosService: BastonariosService) {}

  @Public()
  @Get()
  findPublished() {
    return this.bastonariosService.findPublished();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  findAllForAdmin() {
    return this.bastonariosService.findAllOrdered();
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/:id')
  findOne(@Param('id') id: string) {
    return this.bastonariosService.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreateBastonarioDto) {
    return this.bastonariosService.create(dto as Partial<any>);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBastonarioDto) {
    return this.bastonariosService.update(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bastonariosService.remove(id);
  }
}
