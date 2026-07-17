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
    // sanea anexos: só {mime, data(base64)}; corta o histórico para caber no request.
    for (const m of messages) {
      if (m?.attachments) m.attachments = (m.attachments as any[]).slice(0, 6).map((a) => ({ mime: String(a.mime || 'application/octet-stream'), data: String(a.data || '') }));
    }
    return this.svc.chat(req.user.id, messages);
  }

  // Diagnóstico (sem segredo): provedor/modelo/tem-chave.
  @Get('health')
  health() { return this.llm.describe(); }
}
