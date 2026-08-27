// Endpoint PÚBLICO (sem JWT) — recebe transcrições de reunião (Google Meet) via webhook,
// em tempo real. Protegido por SECRET (?secret= ou body.secret). SEM AdminGuard de propósito
// (quem chama é o Google/n8n/Apps Script, não um usuário logado). O motor casa com o cliente
// existente ou cria um novo e registra a reunião.
import { Body, Controller, Post, Query, UnauthorizedException } from '@nestjs/common';
import { AutomationEngineService } from './automation.engine';
import { GoogleMeetService } from './google-meet.service';

@Controller('automation/public')
export class AutomationPublicController {
  constructor(private readonly engine: AutomationEngineService, private readonly gmeet: GoogleMeetService) {}

  private async check(secret?: string) {
    const real = await this.engine.getWebhookSecret();
    if (!secret || !real || secret !== real) throw new UnauthorizedException('bad secret');
  }

  @Post('meet-webhook')
  async meet(@Body() b: any, @Query('secret') qsecret?: string) {
    await this.check(b?.secret || qsecret);
    return this.engine.ingestMeetTranscript(b);
  }

  // Disparados por pg_cron (Supabase) — o @nestjs/schedule não roda de forma confiável no container.
  @Post('meet-poll')
  async meetPoll(@Body() b: any, @Query('secret') qsecret?: string) {
    await this.check(b?.secret || qsecret);
    return this.gmeet.poll();
  }
  @Post('run-dispatch')
  async runDispatch(@Body() b: any, @Query('secret') qsecret?: string) {
    await this.check(b?.secret || qsecret);
    return this.engine.runDispatch();
  }
}
