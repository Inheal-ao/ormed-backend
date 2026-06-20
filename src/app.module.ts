import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration, { validateEnv } from './config/configuration';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { UploadsModule } from './uploads/uploads.module';
import { NewsModule } from './modules/news/news.module';
import { EventsModule } from './modules/events/events.module';
import { MagazinesModule } from './modules/magazines/magazines.module';
import { BastonariosModule } from './modules/bastonarios/bastonarios.module';
import { PartnersModule } from './modules/partners/partners.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StatsModule } from './modules/stats/stats.module';
import { SpecialtiesModule } from './modules/specialties/specialty.module';
import { ContentSeederModule } from './modules/content-seeder/content-seeder.module';
import { BulletinsModule } from './modules/bulletins/bulletin.module';
import { BooksModule } from './modules/books/book.module';
import { PodcastModule } from './modules/podcast/podcast.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { EventRegistrationsModule } from './modules/event-registrations/event-registration.module';
import { RevMedModule } from './modules/revmed/revmed.module';
import { DocumentsModule } from './modules/documents/document.module';
import { FaqsModule } from './modules/faqs/faq.module';
import { TestimonialsModule } from './modules/testimonials/testimonial.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { CoursesModule } from './modules/courses/course.module';

@Module({
  imports: [
    // Configuração global a partir do .env
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),

    // Ligação ao MongoDB
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodbUri'),
      }),
    }),

    // Rate limiting global: 100 pedidos por minuto por IP
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    AuthModule,
    UsersModule,
    CloudinaryModule,
    UploadsModule,
    NewsModule,
    EventsModule,
    MagazinesModule,
    BastonariosModule,
    PartnersModule,
    SettingsModule,
    StatsModule,
    SpecialtiesModule,
    ContentSeederModule,
    BulletinsModule,
    BooksModule,
    PodcastModule,
    GalleryModule,
    EventRegistrationsModule,
    RevMedModule,
    DocumentsModule,
    FaqsModule,
    TestimonialsModule,
    TimelineModule,
    CoursesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Aplica o rate limiting a todas as rotas
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
