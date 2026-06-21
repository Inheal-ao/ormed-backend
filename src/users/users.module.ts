import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { AdminSeederService } from './admin-seeder.service';
import { UsersController, ProfileController } from './users.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, AdminSeederService],
  exports: [UsersService],
})
export class UsersModule {}
