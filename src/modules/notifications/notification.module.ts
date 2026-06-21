import { Module, Injectable, Controller, Get } from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { ServiceRequest, ServiceRequestSchema } from '../service-requests/service-request.module';
import { Complaint, ComplaintSchema } from '../complaints/complaint.module';
import { ContactMessage, ContactMessageSchema } from '../contact/contact.module';
import { EventRegistration, RegistrationSchema } from '../event-registrations/event-registration.module';
import { ResearchSupport, SupportSchema } from '../research-support/research-support.module';
import { UniversityList, UniversityListSchema } from '../university-lists/university-list.module';

const SR_TERMINAL = ['concluido', 'rejeitado', 'nao-validado'];
const PAID_TYPES = ['inscricao', 'renovacao-inscricao', 'carteira-profissional', 'pagar-cotas', 'declaracao'];

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(ServiceRequest.name) private readonly sr: Model<any>,
    @InjectModel(Complaint.name) private readonly complaints: Model<any>,
    @InjectModel(ContactMessage.name) private readonly contact: Model<any>,
    @InjectModel(EventRegistration.name) private readonly regs: Model<any>,
    @InjectModel(ResearchSupport.name) private readonly research: Model<any>,
    @InjectModel(UniversityList.name) private readonly lists: Model<any>,
  ) {}

  async summary() {
    const active = { status: { $nin: SR_TERMINAL } };
    const [validacoes, solicitacoes, denuncias, mensagens, inscricoes, apoioPesquisa, listas] = await Promise.all([
      this.sr.countDocuments({ ...active, serviceType: 'validacao-documentos' }),
      this.sr.countDocuments({ ...active, serviceType: { $in: PAID_TYPES } }),
      this.complaints.countDocuments({ status: { $ne: 'resolved' } }),
      this.contact.countDocuments({ read: false }),
      this.regs.countDocuments({ status: 'pending' }),
      this.research.countDocuments({ status: 'new' }),
      this.lists.countDocuments({ lastViewedAt: null }),
    ]);

    const counts = { validacoes, solicitacoes, denuncias, mensagens, inscricoes, apoioPesquisa, listas };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // Operações em curso / pendentes recentes (lista geral para o dashboard)
    const take = 6;
    const [srDocs, cDocs, mDocs, rDocs, lDocs] = await Promise.all([
      this.sr.find(active).sort({ createdAt: -1 }).limit(take).lean(),
      this.complaints.find({ status: { $ne: 'resolved' } }).sort({ createdAt: -1 }).limit(take).lean(),
      this.contact.find({ read: false }).sort({ createdAt: -1 }).limit(take).lean(),
      this.research.find({ status: 'new' }).sort({ createdAt: -1 }).limit(take).lean(),
      this.lists.find({ lastViewedAt: null }).sort({ createdAt: -1 }).limit(take).lean(),
    ]);

    const recent = [
      ...srDocs.map((d: any) => ({
        type: PAID_TYPES.includes(d.serviceType) ? 'Documento da Ordem' : 'Validação',
        label: `${d.serviceCode} — ${d.requesterName}`,
        status: d.status,
        at: d.createdAt,
        link: PAID_TYPES.includes(d.serviceType) ? '/admin/solicitacoes' : '/admin/validacoes',
      })),
      ...cDocs.map((d: any) => ({ type: 'Denúncia/Reclamação', label: d.subject, status: d.status, at: d.createdAt, link: '/admin/denuncias' })),
      ...mDocs.map((d: any) => ({ type: 'Mensagem', label: `${d.name}: ${d.subject || '(sem assunto)'}`, status: 'nova', at: d.createdAt, link: '/admin/mensagens' })),
      ...rDocs.map((d: any) => ({ type: 'Apoio à Pesquisa', label: d.name, status: 'novo', at: d.createdAt, link: '/admin/apoio-pesquisa' })),
      ...lDocs.map((d: any) => ({ type: 'Lista de Finalistas', label: `${d.universityName} (${d.year})`, status: 'por ver', at: d.createdAt, link: '/admin/listas-universidades' })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 20);

    return { total, counts, recent };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly s: NotificationsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA, UserRole.EDITOR)
  @Get('summary')
  summary() {
    return this.s.summary();
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServiceRequest.name, schema: ServiceRequestSchema },
      { name: Complaint.name, schema: ComplaintSchema },
      { name: ContactMessage.name, schema: ContactMessageSchema },
      { name: EventRegistration.name, schema: RegistrationSchema },
      { name: ResearchSupport.name, schema: SupportSchema },
      { name: UniversityList.name, schema: UniversityListSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
