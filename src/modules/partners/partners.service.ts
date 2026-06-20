import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseCrudService } from '../../common/base-crud.service';
import { Partner, PartnerDocument } from './schemas/partner.schema';

@Injectable()
export class PartnersService extends BaseCrudService<PartnerDocument> {
  constructor(
    @InjectModel(Partner.name) private readonly partnerModel: Model<PartnerDocument>,
  ) {
    super(partnerModel, ['name']);
  }

  findPublished() {
    return this.partnerModel
      .find({ isPublished: true })
      .sort({ order: 1, createdAt: -1 })
      .exec();
  }

  findAllOrdered() {
    return this.partnerModel.find().sort({ order: 1, createdAt: -1 }).exec();
  }
}
