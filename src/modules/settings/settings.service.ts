import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './schemas/settings.schema';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>,
  ) {}

  /** Devolve o documento de definições, criando-o com valores padrão se não existir. */
  async get(): Promise<SettingsDocument> {
    const existing = await this.settingsModel.findOne({ key: 'global' }).exec();
    if (existing) return existing;
    return this.settingsModel.create({ key: 'global' });
  }

  async update(dto: UpdateSettingsDto): Promise<SettingsDocument> {
    return this.settingsModel
      .findOneAndUpdate({ key: 'global' }, { $set: dto }, { new: true, upsert: true })
      .exec();
  }
}
