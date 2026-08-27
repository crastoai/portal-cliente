// Cron diário do motor de automações (B3+B4). Roda 1x/dia; o dispatch_log dedupe por dia.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationEngineService } from './automation.engine';

@Injectable()
export class AutomationScheduler {
  private readonly log = new Logger('AutomationScheduler');
  constructor(private readonly engine: AutomationEngineService) {}

  // Todo dia às 12:00 UTC (~09:00 America/Sao_Paulo).
  @Cron('0 12 * * *')
  async daily() {
    try { const r = await this.engine.runDispatch(); this.log.log(`cron ok: ${JSON.stringify(r)}`); }
    catch (e: any) { this.log.error(`cron falhou: ${e?.message}`); }
  }
}
