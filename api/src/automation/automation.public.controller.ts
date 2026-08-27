// Endpoint PÚBLICO (sem JWT) — recebe transcrições de reunião (Google Meet) via webhook,
// em tempo real. Protegido por SECRET (?secret= ou body.secret). SEM AdminGuard de propósito
// (quem chama é o Google/n8n/Apps Script, não um usuário logado). O motor casa com o cliente
// existente ou cria um novo e registra a reunião.
import { Body, Controller, Post, Query, UnauthorizedException } from '@nestjs/common';
import { AutomationEngineService } from './automation.engine';

@Controller('automation/public')
export class AutomationPublicController {
  constructor(private readonly engine: AutomationEngineService) {}

  @Post('meet-webhook')
  async meet(@Body() b: any, @Query('secret') qsecret?: string) {
    const secret = b?.secret || qsecret;
    const real = await this.engine.getWebhookSecret();
    if (!secret || !real || secret !== real) throw new UnauthorizedException('bad secret');
    return this.engine.ingestMeetTranscript(b);
  }
}
