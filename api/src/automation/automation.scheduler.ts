// Cron diário do motor de automações (B3+B4). Roda 1x/dia; o dispatch_log dedupe por dia.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationEngineService } from './automation.engine';
import { GoogleMeetService } from './google-meet.service';

@Injectable()
export class AutomationScheduler {
  private readonly log = new Logger('AutomationScheduler');
  constructor(private readonly engine: AutomationEngineService, private readonly gmeet: GoogleMeetService) {}

  // Todo dia às 12:00 UTC (~09:00 America/Sao_Paulo) — aniversários/agendamentos.
  @Cron('0 12 * * *')
  async daily() {
    try { const r = await this.engine.runDispatch(); this.log.log(`cron ok: ${JSON.stringify(r)}`); }
    catch (e: any) { this.log.error(`cron falhou: ${e?.message}`); }
  }

  // A cada 5 min — captura de transcrições do Google Meet (a transcrição só existe pós-reunião).
  @Cron('*/5 * * * *')
  async pollMeet() {
    try { const r = await this.gmeet.poll(); if (r.ingested) this.log.log(`meet poll: +${r.ingested} transcrições`); }
    catch (e: any) { this.log.warn(`meet poll falhou: ${e?.message}`); }
  }
}
