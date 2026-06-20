import { NotFoundException } from '@nestjs/common';
import { Model, FilterQuery, UpdateQuery } from 'mongoose';
import { PaginationDto, PaginatedResult } from './dto/pagination.dto';

/**
 * Serviço CRUD genérico reutilizado pelos módulos de conteúdo.
 * Cada módulo concreto define apenas os campos pesquisáveis e filtros extra.
 */
export abstract class BaseCrudService<T> {
  protected constructor(
    protected readonly model: Model<T>,
    /** Campos onde a pesquisa textual (`search`) é aplicada. */
    protected readonly searchableFields: string[] = [],
  ) {}

  async create(dto: Partial<T>): Promise<T> {
    const created = new this.model(dto);
    return created.save() as Promise<T>;
  }

  async findAllPaginated(
    pagination: PaginationDto,
    baseFilter: FilterQuery<T> = {},
  ): Promise<PaginatedResult<T>> {
    const { page, limit, search } = pagination;
    const filter: FilterQuery<T> = { ...baseFilter };

    if (search && this.searchableFields.length > 0) {
      (filter as Record<string, unknown>).$or = this.searchableFields.map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string): Promise<T> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('Registo não encontrado.');
    return doc;
  }

  async findOneBy(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  async update(id: string, dto: UpdateQuery<T>): Promise<T> {
    const updated = await this.model
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
    if (!updated) throw new NotFoundException('Registo não encontrado.');
    return updated;
  }

  async remove(id: string): Promise<T> {
    const removed = await this.model.findByIdAndDelete(id).exec();
    if (!removed) throw new NotFoundException('Registo não encontrado.');
    return removed;
  }
}
