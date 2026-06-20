import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseCrudService } from '../../common/base-crud.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slug.util';
import { Magazine, MagazineDocument } from './schemas/magazine.schema';
import { CreateMagazineDto, UpdateMagazineDto } from './dto/magazine.dto';

@Injectable()
export class MagazinesService extends BaseCrudService<MagazineDocument> {
  constructor(
    @InjectModel(Magazine.name) private readonly magazineModel: Model<MagazineDocument>,
  ) {
    super(magazineModel, ['title', 'description', 'edition']);
  }

  async createMagazine(dto: CreateMagazineDto): Promise<MagazineDocument> {
    if (dto.isPublished && !dto.pdf?.url) {
      throw new BadRequestException('É necessário um PDF para publicar a revista.');
    }
    const slug = await this.ensureUniqueSlug(dto.slug || slugify(dto.title));
    return this.create({
      ...dto,
      slug,
      publishedAt: dto.isPublished ? new Date() : null,
    } as unknown as Partial<MagazineDocument>);
  }

  async updateMagazine(id: string, dto: UpdateMagazineDto): Promise<MagazineDocument> {
    const current = await this.findOne(id);
    const patch: Record<string, unknown> = { ...dto };

    if (dto.slug || dto.title) {
      patch.slug = await this.ensureUniqueSlug(dto.slug || slugify(dto.title as string), id);
    }
    if (dto.isPublished !== undefined) {
      const willHavePdf = dto.pdf?.url ?? current.pdf?.url;
      if (dto.isPublished && !willHavePdf) {
        throw new BadRequestException('É necessário um PDF para publicar a revista.');
      }
      patch.publishedAt = dto.isPublished ? current.publishedAt ?? new Date() : null;
    }
    return this.update(id, patch);
  }

  /** Lista pública ordenada por ano/edição mais recente. */
  async findPublished(pagination: PaginationDto) {
    const result = await this.findAllPaginated(pagination, { isPublished: true });
    result.items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return result;
  }

  findPublishedBySlug(slug: string) {
    return this.findOneBy({ slug, isPublished: true });
  }

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base || 'revista';
    let counter = 1;
    while (true) {
      const existing = await this.magazineModel.findOne({ slug }).exec();
      if (!existing || existing.id === excludeId) break;
      slug = `${base}-${counter++}`;
    }
    return slug;
  }
}
