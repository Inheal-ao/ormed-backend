import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Magazine, MagazineSchema } from './schemas/magazine.schema';
import { MagazinesService } from './magazines.service';
import { MagazinesController } from './magazines.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Magazine.name, schema: MagazineSchema }]),
  ],
  controllers: [MagazinesController],
  providers: [MagazinesService],
  exports: [MagazinesService],
})
export class MagazinesModule {}
