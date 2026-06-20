import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseCrudService } from '../../common/base-crud.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slug.util';
import { Event, EventDocument } from './schemas/event.schema';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';

@Injectable()
export class EventsService extends BaseCrudService<EventDocument> {
  constructor(@InjectModel(Event.name) private readonly eventModel: Model<EventDocument>) {
    super(eventModel, ['title', 'description', 'location']);
  }

  async createEvent(dto: CreateEventDto): Promise<EventDocument> {
    const slug = await this.ensureUniqueSlug(dto.slug || slugify(dto.title));
    return this.create({ ...dto, slug } as unknown as Partial<EventDocument>);
  }

  async updateEvent(id: string, dto: UpdateEventDto): Promise<EventDocument> {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.slug || dto.title) {
      patch.slug = await this.ensureUniqueSlug(dto.slug || slugify(dto.title as string), id);
    }
    return this.update(id, patch);
  }

  findPublished(pagination: PaginationDto) {
    return this.findAllPaginated(pagination, { isPublished: true });
  }

  findPublishedBySlug(slug: string) {
    return this.findOneBy({ slug, isPublished: true });
  }

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base || 'evento';
    let counter = 1;
    while (true) {
      const existing = await this.eventModel.findOne({ slug }).exec();
      if (!existing || existing.id === excludeId) break;
      slug = `${base}-${counter++}`;
    }
    return slug;
  }
}
