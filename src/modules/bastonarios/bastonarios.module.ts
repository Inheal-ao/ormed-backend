import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Bastonario, BastonarioSchema } from './schemas/bastonario.schema';
import { BastonariosService } from './bastonarios.service';
import { BastonariosController } from './bastonarios.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bastonario.name, schema: BastonarioSchema }]),
  ],
  controllers: [BastonariosController],
  providers: [BastonariosService],
  exports: [BastonariosService],
})
export class BastonariosModule {}
