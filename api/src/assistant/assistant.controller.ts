import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { AssistantService } from './assistant.service';
import { JulieLlmService } from './julie-llm.service';

// A Julie (CFO) é ADMIN-ONLY: AdminGuard barra não-admin. Recebe mensagens + anexos
// (base64) do widget e roda o agente. Anexos vão inline ao Gemini (limite ~20MB por request).
@Controller('assistant')
@UseGuards(JwtOrgGuard, AdminGuard)
export class AssistantController {
  constructor(private readonly svc: AssistantService, private readonly llm: JulieLlmService) {}

  @Post('chat')
  chat(@Req() req: any, @Body() b: any) {
    const messages = Array.isArray(b?.messages) ? b.messages.slice(-16) : [];
    // sanea anexos: só {mime, data(base64)}. Até 100/mensagem (uma PASTA inteira cabe); o
    // limite real é o TAMANHO (front corta no total; body da API é 50MB).
    for (const m of messages) {
      if (m?.attachments) m.attachments = (m.attachments as any[]).slice(0, 100).map((a) => ({ mime: String(a.mime || 'application/octet-stream'), data: String(a.data || '') }));
    }
    const contexto = b?.contexto && b.contexto.organization_id ? { organization_id: String(b.contexto.organization_id) } : undefined;
    return this.svc.chat(req.user.id, messages, contexto);
  }

  // Executa a ação SÓ depois do Crasto confirmar no cartão. Admin-only (guard) + a RPC
  // revalida admin no banco; grava com Auditoria. Whitelist de `kind` no service.
  @Post('execute')
  execute(@Req() req: any, @Body() b: any) {
    return this.svc.executar(req, req.user.id, String(b?.kind || ''), b?.payload || {});
  }

  // Diagnóstico (sem segredo): provedor/modelo/tem-chave.
  @Get('health')
  health() { return this.llm.describe(); }
}
