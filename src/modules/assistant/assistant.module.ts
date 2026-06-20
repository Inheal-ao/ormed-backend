import { Module, Injectable, Controller, Post, Body, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../auth/decorators/public.decorator';
import { Settings, SettingsSchema, SettingsDocument } from '../settings/schemas/settings.schema';
import { Faq, FaqSchema, FaqDocument } from '../faqs/faq.module';
import { News, NewsSchema, NewsDocument } from '../news/schemas/news.schema';
import { Event, EventSchema, EventDocument } from '../events/schemas/event.schema';
import { Announcement, AnnouncementSchema, AnnouncementDocument } from '../announcements/announcement.module';

class ChatMessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MaxLength(8000) content: string;
}

class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  // Texto da página que o utilizador está a ler (para resumir/responder sobre)
  @IsOptional() @IsString() @MaxLength(16000) pageContext?: string;
}

const BASE_PROMPT = `És o "Kamba Med", o assistente de inteligência artificial OFICIAL da Ordem dos Médicos de Angola (ORMED). "Kamba" significa "amigo" — és o amigo médico dos utilizadores.

Estás integrado DENTRO do site oficial da ORMED. Por isso:
- NUNCA digas ao utilizador para "consultar o site oficial" nem "contactar a Ordem" como resposta evasiva — TU fazes parte do site oficial. Usa a informação fornecida abaixo para responder diretamente.
- Se a informação concreta não estiver na base de conhecimento fornecida, indica os contactos da ORMED (que tens abaixo) para o utilizador falar com a equipa.

As tuas funções:
- Responder a perguntas sobre a Ordem, ética e deontologia médica, inscrições, renovações, eventos, formação, publicações, vagas e serviços.
- Resumir e explicar o conteúdo da página que o utilizador está a ler (quando fornecido).
- Dar respostas rápidas e úteis.

Regras de estilo:
- Responde sempre em português (de Portugal/Angola), de forma profissional, simpática e clara.
- Podes usar markdown simples: **negrito** e listas com "- ". Mantém as respostas concisas.
- NÃO inventes factos específicos (datas, números, nomes, valores) que não te sejam dados na base de conhecimento ou no contexto.
- Para questões clínicas individuais, recomenda a consulta presencial de um médico; não dás diagnósticos.`;

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

@Injectable()
export class AssistantService {
  private knowledgeCache = '';
  private knowledgeAt = 0;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>,
    @InjectModel(Faq.name) private readonly faqModel: Model<FaqDocument>,
    @InjectModel(News.name) private readonly newsModel: Model<NewsDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(Announcement.name) private readonly announcementModel: Model<AnnouncementDocument>,
  ) {}

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  /** Constrói a base de conhecimento a partir dos dados reais da plataforma (cache 90s). */
  private async buildKnowledge(): Promise<string> {
    if (this.knowledgeCache && Date.now() - this.knowledgeAt < 90_000) {
      return this.knowledgeCache;
    }
    try {
      const [settings, faqs, news, events, announcements] = await Promise.all([
        this.settingsModel.findOne({ key: 'global' }).lean().exec(),
        this.faqModel.find({ isPublished: true }).limit(20).lean().exec(),
        this.newsModel.find({ isPublished: true }).sort({ publishedAt: -1 }).limit(8).select('title excerpt').lean().exec(),
        this.eventModel.find({ isPublished: true }).sort({ startDate: 1 }).limit(6).select('title startDate location').lean().exec(),
        this.announcementModel.find({ isPublished: true }).sort({ publishedAt: -1 }).limit(6).select('title').lean().exec(),
      ]);

      const parts: string[] = ['=== BASE DE CONHECIMENTO DA ORMED (fonte fiável e atual) ==='];

      if (settings) {
        parts.push(
          `CONTACTOS DA ORMED:\n- Telefone: ${settings.phone}\n- Email: ${settings.email}\n- Morada/Sede: ${settings.address}` +
            (settings.facebook ? `\n- Facebook: ${settings.facebook}` : '') +
            (settings.instagram ? `\n- Instagram: ${settings.instagram}` : '') +
            (settings.linkedin ? `\n- LinkedIn: ${settings.linkedin}` : '') +
            (settings.youtube ? `\n- YouTube: ${settings.youtube}` : ''),
        );
      }

      if (faqs.length) {
        parts.push(
          'PERGUNTAS FREQUENTES:\n' +
            faqs.map((f) => `- P: ${f.question}\n  R: ${f.answer}`).join('\n'),
        );
      }

      if (news.length) {
        parts.push(
          'ÚLTIMAS NOTÍCIAS:\n' +
            news.map((n) => `- ${n.title}${n.excerpt ? ` — ${n.excerpt}` : ''}`).join('\n'),
        );
      }

      if (events.length) {
        parts.push(
          'PRÓXIMOS EVENTOS:\n' +
            events
              .map((e) => {
                const d = e.startDate ? new Date(e.startDate).toLocaleDateString('pt-PT') : '';
                return `- ${e.title}${d ? ` (${d})` : ''}${e.location ? ` — ${e.location}` : ''}`;
              })
              .join('\n'),
        );
      }

      if (announcements.length) {
        parts.push('COMUNICADOS RECENTES:\n' + announcements.map((a) => `- ${a.title}`).join('\n'));
      }

      this.knowledgeCache = parts.join('\n\n');
      this.knowledgeAt = Date.now();
      return this.knowledgeCache;
    } catch {
      return this.knowledgeCache || '';
    }
  }

  async chat(dto: ChatDto): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { reply: 'O assistente ainda não está configurado. Por favor, contacte a equipa da ORMED.' };
    }
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const knowledge = await this.buildKnowledge();
    let systemText = `${BASE_PROMPT}\n\n${knowledge}`;
    if (dto.pageContext && dto.pageContext.trim().length > 40) {
      systemText += `\n\n=== CONTEÚDO DA PÁGINA QUE O UTILIZADOR ESTÁ A VER (usa para resumir/responder sobre "isto") ===\n${dto.pageContext.slice(0, 14000)}`;
    }

    const contents: GeminiContent[] = dto.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { temperature: 0.5, maxOutputTokens: 1000 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        // eslint-disable-next-line no-console
        console.error('Gemini error:', res.status, errText.slice(0, 300));
        if (res.status === 503) {
          return { reply: 'Estou com muita procura neste momento. Tente novamente dentro de alguns segundos. 🙏' };
        }
        return { reply: 'Desculpe, ocorreu um problema ao processar o seu pedido. Tente novamente.' };
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const reply =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ??
        'Não consegui gerar uma resposta. Pode reformular a pergunta?';
      return { reply: reply.trim() };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Assistant fetch failed:', (err as Error).message);
      return { reply: 'Desculpe, o assistente está temporariamente indisponível. Tente novamente mais tarde.' };
    }
  }
}

@Controller('assistant')
export class AssistantController {
  constructor(private readonly s: AssistantService) {}

  @Public()
  @Get('status')
  status() {
    return { configured: this.s.isConfigured() };
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.s.chat(dto);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settings.name, schema: SettingsSchema },
      { name: Faq.name, schema: FaqSchema },
      { name: News.name, schema: NewsSchema },
      { name: Event.name, schema: EventSchema },
      { name: Announcement.name, schema: AnnouncementSchema },
    ]),
  ],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
