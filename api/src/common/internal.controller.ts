import { BadRequestException, Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { EmailService } from './email.service';
import { leadRoteado } from './email-templates';

/**
 * Porta de serviço: o WhatsApp CRM pede ao Portal para MANDAR e-mail.
 *
 * Por que aqui e não no CRM: o e-mail é do Portal — a chave do Resend vive no cofre
 * dele, e a casca/tokens do Design System também. Duplicar isso no CRM seria dois
 * lugares com a identidade da marca, que é exatamente o que a regra de SSOT proíbe
 * (e o dia em que divergirem, o cliente recebe dois e-mails diferentes da "mesma"
 * empresa).
 *
 * Autenticação: segredo compartilhado (`PORTAL_SERVICE_KEY`), o MESMO que o CRM já usa
 * para falar com o Portal. O §19 do doc de lições avisa contra comparar token com env
 * — o caso dele era outro (várias chaves válidas: env, vault, rotacionadas). Aqui só
 * existe uma origem (o env do EasyPanel, para os dois serviços), então a comparação é
 * legítima; feita com `timingSafeEqual` para não vazar o segredo por tempo de resposta.
 */
@Controller('internal')
export class InternalController {
  constructor(private readonly email: EmailService) {}

  private autorizar(chave?: string) {
    const esperado = process.env.PORTAL_SERVICE_KEY || '';
    if (!esperado) throw new ForbiddenException('PORTAL_SERVICE_KEY ausente na API.');
    const a = Buffer.from(String(chave || ''));
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('chave de serviço inválida');
  }

  /** Avisa por e-mail que a agente passou um lead para alguém. */
  @Post('email/lead-routed')
  async leadRouted(@Headers('x-service-key') chave: string, @Body() b: any) {
    this.autorizar(chave);
    const para: string[] = (b?.to || []).filter((x: any) => typeof x === 'string' && x.includes('@'));
    if (!para.length) throw new BadRequestException('sem destinatário');

    const mail = leadRoteado({
      destino: b.destino || 'Atendimento',
      agente: b.agente || 'a agente',
      lead: b.lead || 'Lead sem nome',
      telefone: b.telefone, empresa: b.empresa, email: b.email, motivo: b.motivo,
      falas: Array.isArray(b.falas) ? b.falas.slice(0, 8) : [],
      url: b.url,
    });

    // Um por destinatário: e-mail de rota não é lista de transmissão, e assim a falha de
    // um endereço não derruba os outros.
    const r = await Promise.all(para.map(async (to) => ({ to, ...(await this.email.send(to, mail.subject, mail.html)) })));
    return { enviados: r.filter((x) => x.ok).length, total: r.length, detalhe: r };
  }
}
