import { Module, Injectable, Controller, Get } from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { UsersModule } from '../../users/users.module';
import { UsersService } from '../../users/users.service';
import { ServiceRequest, ServiceRequestSchema } from '../service-requests/service-request.module';
import { Complaint, ComplaintSchema } from '../complaints/complaint.module';
import { ContactMessage, ContactMessageSchema } from '../contact/contact.module';
import { EventRegistration, RegistrationSchema } from '../event-registrations/event-registration.module';
import { ResearchSupport, SupportSchema } from '../research-support/research-support.module';
import { UniversityList, UniversityListSchema } from '../university-lists/university-list.module';

const SR_TERMINAL = ['concluido', 'rejeitado', 'nao-validado'];
const PAID_TYPES = ['inscricao', 'renovacao-inscricao', 'carteira-profissional', 'pagar-cotas', 'declaracao'];

// Categoria de notificação -> permissão necessária (qualquer uma da lista).
const CATEGORY_PERM: Record<string, string[]> = {
  validacoes: ['validacoes'],
  solicitacoes: ['solicitacoes'],
  denuncias: ['denuncias'],
  mensagens: ['mensagens'],
  inscricoes: ['eventos', 'cursos'],
  apoioPesquisa: ['apoio-pesquisa'],
  listas: ['listas-universidades'],
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(ServiceRequest.name) private readonly sr: Model<any>,
    @InjectModel(Complaint.name) private readonly complaints: Model<any>,
    @InjectModel(ContactMessage.name) private readonly contact: Model<any>,
    @InjectModel(EventRegistration.name) private readonly regs: Model<any>,
    @InjectModel(ResearchSupport.name) private readonly research: Model<any>,
    @InjectModel(UniversityList.name) private readonly lists: Model<any>,
    private readonly users: UsersService,
  ) {}

  /** Determina que categorias o utilizador pode ver. */
  private async allowedCategories(actor: AuthUser): Promise<Set<string>> {
    const manager = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BASTONARIA].includes(actor.role as UserRole);
    if (manager) return new Set(Object.keys(CATEGORY_PERM));
    const dbUser = await this.users.findById(actor.userId);
    const perms = dbUser?.permissions ?? [];
    const allowed = new Set<string>();
    for (const [cat, needed] of Object.entries(CATEGORY_PERM)) {
      if (needed.some((p) => perms.includes(p))) allowed.add(cat);
    }
    return allowed;
  }

  async summary(actor: AuthUser) {
    const allowed = await this.allowedCategories(actor);
    const can = (c: string) => allowed.has(c);
    const active = { status: { $nin: SR_TERMINAL } };
    const z = Promise.resolve(0);
    const [validacoes, solicitacoes, denuncias, mensagens, inscricoes, apoioPesquisa, listas] = await Promise.all([
      can('validacoes') ? this.sr.countDocuments({ ...active, serviceType: 'validacao-documentos' }) : z,
      can('solicitacoes') ? this.sr.countDocuments({ ...active, serviceType: { $in: PAID_TYPES } }) : z,
      can('denuncias') ? this.complaints.countDocuments({ status: { $ne: 'resolved' } }) : z,
      can('mensagens') ? this.contact.countDocuments({ read: false }) : z,
      can('inscricoes') ? this.regs.countDocuments({ status: 'pending' }) : z,
      can('apoioPesquisa') ? this.research.countDocuments({ status: 'new' }) : z,
      can('listas') ? this.lists.countDocuments({ lastViewedAt: null }) : z,
    ]);

    const counts = { validacoes, solicitacoes, denuncias, mensagens, inscricoes, apoioPesquisa, listas };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // Operações em curso / pendentes recentes (só as categorias permitidas)
    const take = 6;
    const empty = Promise.resolve([] as any[]);
    const [srVal, srPaid, cDocs, mDocs, rDocs, lDocs] = await Promise.all([
      can('validacoes') ? this.sr.find({ ...active, serviceType: 'validacao-documentos' }).sort({ createdAt: -1 }).limit(take).lean() : empty,
      can('solicitacoes') ? this.sr.find({ ...active, serviceType: { $in: PAID_TYPES } }).sort({ createdAt: -1 }).limit(take).lean() : empty,
      can('denuncias') ? this.complaints.find({ status: { $ne: 'resolved' } }).sort({ createdAt: -1 }).limit(take).lean() : empty,
      can('mensagens') ? this.contact.find({ read: false }).sort({ createdAt: -1 }).limit(take).lean() : empty,
      can('apoioPesquisa') ? this.research.find({ status: 'new' }).sort({ createdAt: -1 }).limit(take).lean() : empty,
      can('listas') ? this.lists.find({ lastViewedAt: null }).sort({ createdAt: -1 }).limit(take).lean() : empty,
    ]);

    const recent = [
      ...srVal.map((d: any) => ({ type: 'Validação', label: `${d.serviceCode} — ${d.requesterName}`, status: d.status, at: d.createdAt, link: '/admin/validacoes' })),
      ...srPaid.map((d: any) => ({ type: 'Documento da Ordem', label: `${d.serviceCode} — ${d.requesterName}`, status: d.status, at: d.createdAt, link: '/admin/solicitacoes' })),
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
  summary(@CurrentUser() actor: AuthUser) {
    return this.s.summary(actor);
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
    UsersModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
