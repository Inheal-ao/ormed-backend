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
import { Faq, FaqSchema, FaqDocument } from '../faqs/faq.module';
import { Milestone, MilestoneSchema, MilestoneDocument } from '../timeline/timeline.module';
import {
  Testimonial,
  TestimonialSchema,
  TestimonialDocument,
} from '../testimonials/testimonial.module';
import { HeroSlide, HeroSlideSchema, HeroSlideDocument } from '../hero/hero.module';

const DEFAULT_HERO = [
  {
    title: 'Pela Dignidade Médica', subtitle: 'Rumo à Excelência',
    description: 'Há mais de 35 anos que existimos para garantir, ao profissional médico, o exercício da medicina em Angola com a dignidade merecida.',
    image: { url: '/images/bastonaria-campaign.jpg', publicId: '' },
    ctaLabel: 'Inscreva-se Agora', ctaHref: '/inscricao/', cta2Label: 'Saber Mais', cta2Href: '/sobre/', order: 0,
  },
  {
    title: 'Ética e Deontologia', subtitle: 'Pilares da Profissão',
    description: 'Pautamo-nos pelo rigor e cumprimento escrupuloso da ética e da deontologia profissional, visando prestar um serviço de saúde com qualidade.',
    image: { url: '/images/bastonaria-2.jpg', publicId: '' },
    ctaLabel: 'Código Deontológico', ctaHref: '/codigo-deontologico/', cta2Label: 'Denúncias', cta2Href: '/denuncias/', order: 1,
  },
  {
    title: 'Formação Contínua', subtitle: 'Educação Permanente',
    description: 'Programas de formação, workshops, webinars e congressos para manter os médicos angolanos na vanguarda do conhecimento médico.',
    image: { url: '/images/bastonaria-1.jpg', publicId: '' },
    ctaLabel: 'Próximos Eventos', ctaHref: '/eventos/', cta2Label: 'Área do Membro', cta2Href: '/area-membro/', order: 2,
  },
];

const DEFAULT_STATS = [
  { value: '35+', label: 'Anos de Existência', icon: 'Calendar', order: 1 },
  { value: '12.500+', label: 'Médicos Inscritos', icon: 'Users', order: 2 },
  { value: '18', label: 'Províncias com Delegações', icon: 'MapPin', order: 3 },
  { value: '98%', label: 'Taxa de Satisfação', icon: 'Heart', order: 4 },
];

// ANEXO I — Lista oficial das especialidades reconhecidas em Angola (39).
// Fonte de verdade para a formação dos Colégios de Especialidades.
const OFFICIAL_SPECIALTIES = [
  'Anestesiologia', 'Anatomia Patológica', 'Cardiologia', 'Cardiologia Pediátrica',
  'Cirurgia Cardiotorácica', 'Cirurgia Geral', 'Cirurgia Pediátrica', 'Cirurgia Plástica',
  'Cirurgia Vascular', 'Dermatologia', 'Endocrinologia', 'Ginecologia e Obstetrícia',
  'Gastroenterologia', 'Hematologia', 'Imunoalergologia', 'Infecciologia',
  'Medicina do Trabalho', 'Medicina Física e Reabilitação', 'Medicina Interna',
  'Medicina Legal', 'Nefrologia', 'Neonatologia', 'Neurocirurgia', 'Neurologia',
  'Oftalmologia', 'Oncologia', 'Oncologia e Hemato-oncologia Pediátrica',
  'Ortopedia e Traumatologia', 'Otorrinolaringologia', 'Patologia Clínica', 'Pediatria',
  'Pneumologia', 'Psiquiatria', 'Radiologia', 'Reumatologia', 'Saúde Pública',
  'Urologia', 'Medicina Intensiva', 'Geriatria',
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

const DEFAULT_FAQS = [
  { question: 'Como posso inscrever-me na Ordem dos Médicos?', answer: 'Para se inscrever, necessita de apresentar o diploma de licenciatura em Medicina homologado, certificado de residência (se aplicável), fotografia tipo passe, e pagar a taxa de inscrição. Pode efetuar o processo online através da nossa plataforma digital.' },
  { question: 'Qual a diferença entre a Ordem e o Sindicato dos Médicos?', answer: 'A Ordem dos Médicos regula o exercício profissional, garante a ética e deontologia médica, e atribui a carteira profissional. O Sindicato dos Médicos defende os interesses laborais e socioeconómicos dos médicos. São entidades distintas e complementares.' },
  { question: 'Como renovar a minha inscrição?', answer: 'A renovação anual pode ser feita online na Área do Membro, mediante pagamento da quota anual. Receberá um lembrete 30 dias antes do vencimento.' },
  { question: 'A ORMED emprega médicos?', answer: 'Não. A Ordem não é responsável pela empregabilidade dos médicos. A nossa função é regular o exercício da profissão, garantir a qualidade e a ética. Para questões laborais, contacte o Sindicato dos Médicos.' },
  { question: 'Como apresentar uma denúncia?', answer: 'Pode apresentar uma denúncia através do nosso formulário online na secção "Denúncias", ou presencialmente na sede da ORMED. Toda a informação é tratada com confidencialidade.' },
  { question: 'Quais as especialidades reconhecidas pela ORMED?', answer: 'A ORMED reconhece mais de 50 especialidades médicas, desde Medicina Geral e Familiar até especialidades cirúrgicas e de diagnóstico. Consulte a lista completa na secção "Especialidades".' },
];

const DEFAULT_TIMELINE = [
  { year: '1991', title: 'Fundação da ORMED', description: 'Criação da Ordem dos Médicos de Angola como instituição de utilidade pública.', order: 0 },
  { year: '1997', title: 'Primeira Bastonaria', description: 'Dr. Carlos Alberto Mac assume como primeiro Bastonário.', order: 1 },
  { year: '2002', title: 'Expansão Nacional', description: 'Início da criação de delegações em todas as províncias de Angola.', order: 2 },
  { year: '2010', title: 'Código Deontológico', description: 'Aprovação do primeiro Código Deontológico da medicina angolana.', order: 3 },
  { year: '2015', title: 'Plataforma Digital', description: 'Lançamento do primeiro sistema de gestão online para médicos.', order: 4 },
  { year: '2019', title: 'Parceria Internacional', description: 'Acordo de cooperação com a Ordem dos Médicos de Portugal e outras ordens internacionais.', order: 5 },
  { year: '2025', title: 'Nova Era', description: 'Dra. Jovita André assume a Bastonaria, trazendo nova visão para a instituição.', order: 6 },
];

const DEFAULT_TESTIMONIALS = [
  { name: 'Dr. António Silva', role: 'Médico Internista', location: 'Luanda', text: 'A ORMED tem sido fundamental para a minha carreira. A formação contínua e o apoio ético são incomparáveis.', order: 0 },
  { name: 'Dra. Maria Fernandes', role: 'Pediatra', location: 'Benguela', text: 'Graças à ORMED, consegui especialização em Portugal com bolsa de estudo. A instituição realmente cuida dos seus membros.', order: 1 },
  { name: 'Dr. Pedro Kiala', role: 'Cirurgião', location: 'Huambo', text: 'O sistema de prescrição eletrónica revolucionou a minha prática clínica. Excelente inovação da ORMED.', order: 2 },
  { name: 'Dra. Ana Costa', role: 'Ginecologista', location: 'Lubango', text: 'A representação da ORMED junto do governo tem melhorado significativamente as condições de trabalho dos médicos.', order: 3 },
];

@Injectable()
export class ContentSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger('ContentSeeder');

  constructor(
    @InjectModel(Stat.name) private readonly statModel: Model<StatDocument>,
    @InjectModel(Specialty.name) private readonly specialtyModel: Model<SpecialtyDocument>,
    @InjectModel(Bastonario.name) private readonly bastonarioModel: Model<BastonarioDocument>,
    @InjectModel(Faq.name) private readonly faqModel: Model<FaqDocument>,
    @InjectModel(Milestone.name) private readonly milestoneModel: Model<MilestoneDocument>,
    @InjectModel(Testimonial.name) private readonly testimonialModel: Model<TestimonialDocument>,
    @InjectModel(HeroSlide.name) private readonly heroModel: Model<HeroSlideDocument>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedIfEmpty('estatísticas', this.statModel, DEFAULT_STATS);
    await this.ensureOfficialSpecialties();
    await this.seedIfEmpty('bastonários', this.bastonarioModel, DEFAULT_BASTONARIOS);
    await this.seedIfEmpty('FAQs', this.faqModel, DEFAULT_FAQS.map((f, i) => ({ ...f, order: i })));
    await this.seedIfEmpty('cronologia', this.milestoneModel, DEFAULT_TIMELINE);
    await this.seedIfEmpty('testemunhos', this.testimonialModel, DEFAULT_TESTIMONIALS);
    await this.seedIfEmpty('hero', this.heroModel, DEFAULT_HERO);
  }

  /** Garante que as 39 especialidades oficiais (ANEXO I) existem, mesmo que a coleção já tenha dados. */
  private async ensureOfficialSpecialties() {
    try {
      let added = 0;
      for (let i = 0; i < OFFICIAL_SPECIALTIES.length; i++) {
        const name = OFFICIAL_SPECIALTIES[i];
        const res = await this.specialtyModel.updateOne(
          { name },
          { $set: { order: i }, $setOnInsert: { name, isPublished: true } },
          { upsert: true },
        ).exec();
        if (res.upsertedCount) added += 1;
      }
      this.logger.log(`Especialidades oficiais garantidas (${OFFICIAL_SPECIALTIES.length} total, ${added} novas).`);
    } catch (err) {
      this.logger.error(`Falha a garantir especialidades oficiais: ${(err as Error).message}`);
    }
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
      { name: Faq.name, schema: FaqSchema },
      { name: Milestone.name, schema: MilestoneSchema },
      { name: Testimonial.name, schema: TestimonialSchema },
      { name: HeroSlide.name, schema: HeroSlideSchema },
    ]),
  ],
  providers: [ContentSeederService],
})
export class ContentSeederModule {}
