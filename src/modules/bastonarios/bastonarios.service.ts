import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseCrudService } from '../../common/base-crud.service';
import { Bastonario, BastonarioDocument } from './schemas/bastonario.schema';

@Injectable()
export class BastonariosService extends BaseCrudService<BastonarioDocument> {
  constructor(
    @InjectModel(Bastonario.name)
    private readonly bastonarioModel: Model<BastonarioDocument>,
  ) {
    super(bastonarioModel, ['name', 'mandate']);
  }

  /** Lista pública ordenada (atual primeiro, depois por `order`). */
  findPublished() {
    return this.bastonarioModel
      .find({ isPublished: true })
      .sort({ isCurrent: -1, order: 1, createdAt: -1 })
      .exec();
  }

  findAllOrdered() {
    return this.bastonarioModel.find().sort({ order: 1, createdAt: -1 }).exec();
  }
}
