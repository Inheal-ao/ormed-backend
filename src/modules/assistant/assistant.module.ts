import { Module, Injectable, Controller, Post, Body, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../auth/decorators/public.decorator';

class ChatMessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MaxLength(6000) content: string;
}

class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  // Texto opcional de contexto (ex.: um comunicado/artigo para resumir)
  @IsOptional() @IsString() @MaxLength(20000) context?: string;
}

const SYSTEM_PROMPT = `És o Assistente de IA da Ordem dos Médicos de Angola (ORMED).

A tua função:
- Responder de forma rápida e clara a perguntas sobre a Ordem, ética e deontologia médica, inscrições, renovações, eventos, formação, publicações e serviços.
- Resumir comunicados, artigos, documentos ou textos que te sejam fornecidos.
- Ajudar tanto médicos como cidadãos.

Regras:
- Responde sempre em português (de Portugal/Angola), de forma profissional, simpática e concisa.
- Usa listas curtas quando ajudar a clareza.
- NÃO inventes factos específicos (datas, números, nomes, valores) que não te sejam dados. Se não tiveres a informação, diz que o utilizador deve consultar o site da ORMED ou contactar a Ordem.
- Para questões clínicas individuais, recomenda sempre a consulta de um médico; não dás diagnósticos.`;

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

@Injectable()
export class AssistantService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async chat(dto: ChatDto): Promise<{ reply: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        reply:
          'O assistente ainda não está configurado. Por favor, contacte a equipa da ORMED.',
      };
    }
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const contents: GeminiContent[] = dto.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Injeta o contexto (texto a resumir/analisar) na última mensagem do utilizador
    if (dto.context && contents.length > 0) {
      const last = contents[contents.length - 1];
      last.parts[0].text = `Contexto fornecido:\n"""\n${dto.context}\n"""\n\nPergunta/pedido: ${last.parts[0].text}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        // eslint-disable-next-line no-console
        console.error('Gemini error:', res.status, errText.slice(0, 300));
        return {
          reply:
            'Desculpe, ocorreu um problema ao contactar o assistente. Tente novamente dentro de momentos.',
        };
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
      return {
        reply:
          'Desculpe, o assistente está temporariamente indisponível. Tente novamente mais tarde.',
      };
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

  // 15 pedidos por minuto por IP
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.s.chat(dto);
  }
}

@Module({
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
