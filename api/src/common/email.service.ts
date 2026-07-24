import { Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from './rls-db.service';

// Envio transacional (Resend). A CHAVE VIVE NO COFRE (Vault): lida via
// public.reveal_provider_key('resend_email') (service_role) — nunca em texto no código/env.
// O remetente vem de automation.integration_configs.from_addr (não-secreto).
@Injectable()
export class EmailService {
  private log = new Logger('Email');

  constructor(private readonly db: RlsDbService) {}

  private async config(): Promise<{ key: string | null; from: string }> {
    return this.db.asService(async (c) => {
      let key: string | null = null;
      try { key = (await c.query(`select public.reveal_provider_key('resend_email') as k`)).rows[0]?.k ?? null; } catch { key = null; }
      const from = (await c.query(`select from_addr from automation.integration_configs where key='resend_email'`)).rows[0]?.from_addr
        || 'Crasto.AI <no-reply@crasto.ai>';
      return { key, from };
    });
  }

  /** Envia um e-mail. Nunca lança: devolve {ok:false,error} — quem chama decide o que fazer.
   *  `attachments` (opcional) usa o formato do Resend: {filename, path} (URL) ou {filename, content}. */
  async send(to: string, subject: string, html: string, attachments?: { filename: string; path: string }[]): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { key, from } = await this.config();
    if (!key) { this.log.warn('Resend sem chave no cofre'); return { ok: false, error: 'E-mail não configurado (sem chave do Resend no cofre).' }; }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, ...(attachments && attachments.length ? { attachments } : {}) }),
        signal: ctrl.signal,
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) { this.log.warn(`Resend ${r.status}: ${j?.message || ''}`); return { ok: false, error: j?.message || `Resend ${r.status}` }; }
      return { ok: true, id: j?.id };
    } catch (e: any) {
      this.log.warn(`Resend falhou: ${e.message}`);
      return { ok: false, error: e.message };
    } finally {
      clearTimeout(t);
    }
  }
}
