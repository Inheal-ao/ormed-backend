import {
  Module, Injectable, Controller, Get, Query, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { MongooseModule, InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { AuthUser } from '../../auth/decorators/current-user.decorator';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ default: '' }) userEmail: string;
  @Prop({ default: '' }) userRole: string;
  @Prop({ default: '' }) method: string;
  @Prop({ default: '' }) section: string;
  @Prop({ default: '' }) action: string;
  @Prop({ default: '' }) path: string;
}
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

const SECTION_LABEL: Record<string, string> = {
  news: 'Notícias', announcements: 'Comunicados', jobs: 'Vagas', events: 'Eventos',
  'event-registrations': 'Inscrições', courses: 'Cursos', magazines: 'Revistas',
  revmed: 'RevMed', documents: 'Documentos', bulletins: 'Boletins', books: 'Livros',
  podcast: 'Podcast', gallery: 'Galeria', bastonarios: 'Bastonários', orgaos: 'Órgãos',
  partners: 'Parceiros', stats: 'Estatísticas', specialties: 'Especialidades',
  'research-support': 'Apoio à Pesquisa', 'service-requests': 'Solicitações',
  'university-lists': 'Listas das Universidades', complaints: 'Denúncias', contact: 'Mensagens',
  newsletter: 'Newsletter', faqs: 'FAQs', testimonials: 'Testemunhos', timeline: 'Cronologia',
  settings: 'Definições', users: 'Utilizadores', 'access-codes': 'Códigos de Acesso',
};
const VERB: Record<string, string> = { POST: 'Criou', PATCH: 'Atualizou', PUT: 'Atualizou', DELETE: 'Eliminou' };
const SKIP = ['auth', 'audit', 'notifications'];

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  record(user: AuthUser, method: string, path: string) {
    const parts = path.split('?')[0].split('/').filter(Boolean); // ['api','news',...]
    const seg = parts[0] === 'api' ? parts[1] : parts[0];
    if (!seg || SKIP.includes(seg)) return;
    const section = SECTION_LABEL[seg] ?? seg;
    const action = `${VERB[method] ?? method} — ${section}`;
    void this.model.create({
      userId: user.userId, userEmail: user.email, userRole: user.role,
      method, section, action, path,
    }).catch(() => {});
  }

  async report(from: Date, to: Date) {
    const logs = await this.model.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).lean();
    const byUserMap = new Map<string, { userId: string; email: string; role: string; count: number }>();
    for (const l of logs) {
      const k = l.userId;
      const cur = byUserMap.get(k) ?? { userId: l.userId, email: (l as any).userEmail, role: (l as any).userRole, count: 0 };
      cur.count += 1;
      byUserMap.set(k, cur);
    }
    return {
      from, to,
      total: logs.length,
      byUser: Array.from(byUserMap.values()).sort((a, b) => b.count - a.count),
      operations: logs.map((l: any) => ({
        email: l.userEmail, role: l.userRole, action: l.action, section: l.section, method: l.method, at: l.createdAt,
      })),
    };
  }
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method as string;
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return next.handle();
    return next.handle().pipe(
      tap(() => {
        const user = req.user as AuthUser | undefined;
        if (user?.userId) this.audit.record(user, method, req.path || req.originalUrl || '');
      }),
    );
  }
}

@Controller('audit')
export class AuditController {
  constructor(private readonly s: AuditService) {}

  /** Relatório de operações por período (Admin e Bastonária). */
  @Roles(UserRole.SUPER_ADMIN, UserRole.BASTONARIA)
  @Get('report')
  report(@Query('range') range?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    let start: Date;
    let end = new Date();
    if (range === 'week') {
      start = new Date(now); start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0);
    } else if (range === 'custom' && from) {
      start = new Date(from); end = to ? new Date(to) : new Date();
      end.setHours(23, 59, 59, 999);
    } else {
      // hoje
      start = new Date(now); start.setHours(0, 0, 0, 0);
    }
    return this.s.report(start, end);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AuditModule {}
