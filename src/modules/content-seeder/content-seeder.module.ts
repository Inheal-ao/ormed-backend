import { Module, Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Stat, StatSchema, StatDocument } from '../stats/schemas/stat.schema';
import {
  Specialty,
  SpecialtySchema,
  SpecialtyDocument,
} from '../specialties/specialty.module';
import {
  Bastonario,
  BastonarioSchema,
  BastonarioDocument,
} from '../bastonarios/schemas/bastonario.schema';

const DEFAULT_STATS = [
  { value: '35+', label: 'Anos de Existência', icon: 'Calendar', order: 1 },
  { value: '12.500+', label: 'Médicos Inscritos', icon: 'Users', order: 2 },
  { value: '18', label: 'Províncias com Delegações', icon: 'MapPin', order: 3 },
  { value: '98%', label: 'Taxa de Satisfação', icon: 'Heart', order: 4 },
];

const DEFAULT_SPECIALTIES = [
  'Medicina Geral e Familiar', 'Medicina Interna', 'Cirurgia Geral', 'Pediatria',
  'Ginecologia e Obstetrícia', 'Anestesiologia', 'Cardiologia', 'Dermatologia',
  'Endocrinologia', 'Gastroenterologia', 'Hematologia', 'Infectologia', 'Nefrologia',
  'Neurologia', 'Oftalmologia', 'Ortopedia', 'Otorrinolaringologia', 'Pneumologia',
  'Psiquiatria', 'Radiologia', 'Reumatologia', 'Urologia', 'Oncologia',
  'Medicina Intensiva', 'Medicina de Emergência',
];

const DEFAULT_BASTONARIOS = [
  {
    name: 'Dra. Jovita André', mandate: '2025 - Presente', isCurrent: true, order: 0,
    photo: { url: '/images/bastonaria.jpg', publicId: '' },
    bio: 'Licenciatura em Medicina - UAN (1993). Especialidade em Medicina Interna - Hospital da Força Aérea do Galeão/Rio (2004). Especialidade em Reumatologia - UFRJ (2005). Docente Universitária. MBA em Gestão em Saúde. Coronel-Médica reformada das FAA.',
    quote: 'Aproveito esse momento para reconhecer a importância de todos e a graça que é poder contar com a colaboração e a parceria de pessoas de bem. Juntos podemos fazer a diferença!',
  },
  { name: 'Dra. Elisa Gaspar', mandate: '2019 - 2025', isCurrent: false, order: 1, photo: { url: '/images/bastonaria-elisa-gaspar.jpg', publicId: '' }, bio: 'Ex-Bastonária da Ordem dos Médicos de Angola.', quote: '' },
  { name: 'Dr. Carlos José Pintos', mandate: '2007 - 2019', isCurrent: false, order: 2, photo: { url: '/images/bastonario-pintos-sousa.png', publicId: '' }, bio: 'Ex-Bastonário da Ordem dos Médicos de Angola.', quote: '' },
  { name: 'Dr. José João Bastos', mandate: '2002 - 2007', isCurrent: false, order: 3, photo: { url: '/images/bastonario-bastos-santos.png', publicId: '' }, bio: 'Ex-Bastonário da Ordem dos Médicos de Angola.', quote: '' },
  { name: 'Dr. Carlos Fernandes', mandate: '1999 - 2002', isCurrent: false, order: 4, photo: { url: '/images/bastonario-fernandes-santos.png', publicId: '' }, bio: 'Ex-Bastonário da Ordem dos Médicos de Angola.', quote: '' },
  { name: 'Dr. Carlos Alberto Mac', mandate: '1997 - 1998', isCurrent: false, order: 5, photo: { url: '/images/bastonario-mac-mahon.png', publicId: '' }, bio: 'Ex-Bastonário da Ordem dos Médicos de Angola.', quote: '' },
];

@Injectable()
export class ContentSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger('ContentSeeder');

  constructor(
    @InjectModel(Stat.name) private readonly statModel: Model<StatDocument>,
    @InjectModel(Specialty.name) private readonly specialtyModel: Model<SpecialtyDocument>,
    @InjectModel(Bastonario.name) private readonly bastonarioModel: Model<BastonarioDocument>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedIfEmpty('estatísticas', this.statModel, DEFAULT_STATS);
    await this.seedIfEmpty(
      'especialidades',
      this.specialtyModel,
      DEFAULT_SPECIALTIES.map((name, i) => ({ name, order: i })),
    );
    await this.seedIfEmpty('bastonários', this.bastonarioModel, DEFAULT_BASTONARIOS);
  }

  private async seedIfEmpty(
    label: string,
    model: Model<any>,
    data: Record<string, unknown>[],
  ) {
    try {
      const count = await model.countDocuments().exec();
      if (count > 0) return;
      await model.insertMany(data);
      this.logger.log(`Conteúdo inicial de ${label} criado (${data.length} registos).`);
    } catch (err) {
      this.logger.error(`Falha a semear ${label}: ${(err as Error).message}`);
    }
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stat.name, schema: StatSchema },
      { name: Specialty.name, schema: SpecialtySchema },
      { name: Bastonario.name, schema: BastonarioSchema },
    ]),
  ],
  providers: [ContentSeederService],
})
export class ContentSeederModule {}
