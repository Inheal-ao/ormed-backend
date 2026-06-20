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
import { NewsService } from './news.service';
import { CreateNewsDto, UpdateNewsDto } from './dto/news.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  // ===== Rotas públicas (site) =====
  @Public()
  @Get()
  findPublished(@Query() pagination: PaginationDto) {
    return this.newsService.findPublished(pagination);
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.newsService.findPublishedBySlug(slug);
  }

  // ===== Rotas de gestão (admin) =====
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/all')
  findAllForAdmin(@Query() pagination: PaginationDto) {
    return this.newsService.findAllPaginated(pagination);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Get('admin/:id')
  findOne(@Param('id') id: string) {
    return this.newsService.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Post()
  create(@Body() dto: CreateNewsDto) {
    return this.newsService.createNews(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNewsDto) {
    return this.newsService.updateNews(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }
}
