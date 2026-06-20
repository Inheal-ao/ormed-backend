import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Stat, StatSchema } from './schemas/stat.schema';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Stat.name, schema: StatSchema }])],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
