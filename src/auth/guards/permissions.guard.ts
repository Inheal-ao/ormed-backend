import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/schemas/user.schema';
import { AuthUser } from '../decorators/current-user.decorator';

// Segmento base da API -> chave(s) de permissão. Rotas não mapeadas não são restringidas aqui.
const CONTENT_MAP: Record<string, string[]> = {
  news: ['noticias'],
  announcements: ['comunicados'],
  jobs: ['vagas'],
  events: ['eventos'],
  'event-registrations': ['eventos', 'cursos'],
  courses: ['cursos'],
  magazines: ['revistas'],
  revmed: ['revmed'],
  documents: ['documentos'],
  bulletins: ['boletins'],
  books: ['livros'],
  podcast: ['podcast'],
  gallery: ['galeria'],
  bastonarios: ['bastonarios'],
  orgaos: ['orgaos'],
  partners: ['parceiros'],
  stats: ['estatisticas'],
  specialties: ['especialidades'],
  'research-support': ['apoio-pesquisa'],
  'service-requests': ['solicitacoes', 'validacoes'],
  'university-lists': ['listas-universidades'],
  complaints: ['denuncias'],
  contact: ['mensagens'],
  newsletter: ['newsletter'],
  faqs: ['faqs'],
  testimonials: ['testemunhos'],
  timeline: ['cronologia'],
  settings: ['definicoes'],
};

function sectionFor(path: string): string[] | null {
  const parts = path.split('?')[0].split('/').filter(Boolean); // ['api','news',...]
  const idx = parts[0] === 'api' ? 1 : 0;
  const seg = parts[idx];
  return seg && CONTENT_MAP[seg] ? CONTENT_MAP[seg] : null;
}

/**
 * Restringe os FUNCIONÁRIOS às secções constantes nas suas permissões.
 * Só atua para funcionários autenticados em rotas de conteúdo conhecidas.
 * Os restantes perfis são tratados pelo RolesGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser; path?: string; originalUrl?: string }>();
    const user = req.user;
    if (!user || user.role !== UserRole.FUNCIONARIO) return true;

    const sections = sectionFor(req.path || req.originalUrl || '');
    if (!sections) return true; // rota não-conteúdo

    const dbUser = await this.users.findById(user.userId);
    const perms = dbUser?.permissions ?? [];
    if (!sections.some((s) => perms.includes(s))) {
      throw new ForbiddenException('Não tem permissão para aceder a esta secção.');
    }
    return true;
  }
}
