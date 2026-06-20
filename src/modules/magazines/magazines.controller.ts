import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { MagazinesService } from './magazines.service';
import { CreateMagazineDto, UpdateMagazineDto } from './dto/magazine.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('magazines')
export class MagazinesController {
  constructor(private readonly magazinesService: MagazinesService) {}

  @Public()
  @Get()
  findPublished(@Query() pagination: PaginationDto) {
    return this.magazinesService.findPublished(pagination);
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.magazinesService.findPublishedBySlug(slug);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  findAllForAdmin(@Query() pagination: PaginationDto) {
    return this.magazinesService.findAllPaginated(pagination);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/:id')
  findOne(@Param('id') id: string) {
    return this.magazinesService.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreateMagazineDto) {
    return this.magazinesService.createMagazine(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMagazineDto) {
    return this.magazinesService.updateMagazine(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.magazinesService.remove(id);
  }
}
