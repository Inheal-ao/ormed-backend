import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Partner, PartnerSchema } from './schemas/partner.schema';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Partner.name, schema: PartnerSchema }])],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
