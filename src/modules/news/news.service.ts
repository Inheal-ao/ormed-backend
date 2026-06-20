import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseCrudService } from '../../common/base-crud.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slug.util';
import { News, NewsDocument } from './schemas/news.schema';
import { CreateNewsDto, UpdateNewsDto } from './dto/news.dto';

@Injectable()
export class NewsService extends BaseCrudService<NewsDocument> {
  constructor(@InjectModel(News.name) private readonly newsModel: Model<NewsDocument>) {
    super(newsModel, ['title', 'excerpt', 'category', 'tags']);
  }

  async createNews(dto: CreateNewsDto): Promise<NewsDocument> {
    const slug = await this.ensureUniqueSlug(dto.slug || slugify(dto.title));
    // Data de publicação: a definida manualmente, ou a data atual se publicada
    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt)
      : dto.isPublished
        ? new Date()
        : null;
    return this.create({ ...dto, slug, publishedAt } as Partial<NewsDocument>);
  }

  async updateNews(id: string, dto: UpdateNewsDto): Promise<NewsDocument> {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) {
      patch.slug = await this.ensureUniqueSlug(dto.slug || slugify(dto.title as string), id);
    }
    if (dto.publishedAt) {
      patch.publishedAt = new Date(dto.publishedAt);
    } else if (dto.isPublished !== undefined) {
      const current = await this.findOne(id);
      patch.publishedAt = dto.isPublished ? current.publishedAt ?? new Date() : null;
    }
    return this.update(id, patch);
  }

  /** Lista pública: apenas notícias publicadas. */
  findPublished(pagination: PaginationDto) {
    return this.findAllPaginated(pagination, { isPublished: true });
  }

  async findPublishedBySlug(slug: string): Promise<NewsDocument | null> {
    return this.findOneBy({ slug, isPublished: true });
  }

  /** Garante que o slug é único, acrescentando sufixo numérico se necessário. */
  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base || 'noticia';
    let counter = 1;
    while (true) {
      const existing = await this.newsModel.findOne({ slug }).exec();
      if (!existing || existing.id === excludeId) break;
      slug = `${base}-${counter++}`;
    }
    return slug;
  }
}
