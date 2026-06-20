import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseCrudService } from '../../common/base-crud.service';
import { Stat, StatDocument } from './schemas/stat.schema';

@Injectable()
export class StatsService extends BaseCrudService<StatDocument> {
  constructor(@InjectModel(Stat.name) private readonly statModel: Model<StatDocument>) {
    super(statModel, ['label']);
  }

  findPublished() {
    return this.statModel
      .find({ isPublished: true })
      .sort({ order: 1, createdAt: 1 })
      .exec();
  }

  findAllOrdered() {
    return this.statModel.find().sort({ order: 1, createdAt: 1 }).exec();
  }
}
