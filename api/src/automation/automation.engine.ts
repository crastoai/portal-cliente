// ============================================================================
// AutomationEngineService — motor de automações (B3+B4).
// Config (automation_rules), agendamentos por empresa (reminders) e o disparo
// nos canais: sininho (support.notifications), e-mail (Resend) e WhatsApp (Evolution).
// Roda como service_role (asService): endpoints admin-only + o cron (sem request).
// ============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { RlsDbService } from '../common/rls-db.service';
import { EmailService } from '../common/email.service';
import type { PoolClient } from 'pg';

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (ch) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[ch]));

type Ctx = { orgId: string; orgName?: string; title: string; message: string; createdBy?: string; waInstance?: string; waTo?: string; emailTo?: string };

@Injectable()
export class AutomationEngineService {
  private readonly log = new Logger('AutomationEngine');
  constructor(private readonly db: RlsDbService, private readonly email: EmailService) {}

  // ── Config (regras configuráveis) ──
  listRules() { return this.db.asService(async (c) => (await c.query(`select rule_type, name, enabled, channels, template, config from automation.automation_rules order by name`)).rows); }
  saveRule(p: any) {
    return this.db.asService(async (c) => {
      await c.query(
        `update automation.automation_rules set enabled=coalesce($2,enabled), channels=coalesce($3,channels), template=coalesce($4,template), config=coalesce($5,config), updated_at=now() where rule_type=$1`,
        [p.rule_type, p.enabled ?? null, p.channels ?? null, p.template ?? null, p.config ?? null],
      );
      return { ok: true };
    });
  }

  // ── Agendamentos por empresa ──
  remindersByOrg(orgId: string) { return this.db.asService(async (c) => (await c.query(`select id, due_at, title, message, channels, status, sent_at from automation.reminders where organization_id=$1 order by due_at`, [orgId])).rows); }
  createReminder(p: any, createdBy?: string) {
    return this.db.asService(async (c) => {
      const r = await c.query(
        `insert into automation.reminders (organization_id, due_at, title, message, channels, created_by, meta) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [p.organization_id, p.due_at, p.title, p.message ?? null, p.channels ?? ['sininho'], createdBy ?? null, p.meta ?? {}],
      );
      return { ok: true, id: r.rows[0]?.id };
    });
  }
  cancelReminder(id: string) { return this.db.asService(async (c) => { await c.query(`update automation.reminders set status='cancelled' where id=$1 and status='pending'`, [id]); return { ok: true }; }); }

  // ── Disparo (usado pelo cron e pelo "rodar agora") ──
  async runDispatch(): Promise<{ reminders: number; rules: number }> {
    return this.db.asService(async (c) => {
      let rc = 0, ruc = 0;
      // 1) Agendamentos vencidos
      const due = (await c.query(`select r.*, o.name as org_name from automation.reminders r join public.organizations o on o.id=r.organization_id where r.status='pending' and r.due_at <= now()`)).rows;
      for (const r of due) {
        await this.dispatch(c, r.channels || [], { orgId: r.organization_id, orgName: r.org_name, title: r.title, message: r.message || r.title, createdBy: r.created_by, waInstance: r.meta?.wa_instance, waTo: r.meta?.wa_to, emailTo: r.meta?.email_to });
        await c.query(`update automation.reminders set status='sent', sent_at=now() where id=$1`, [r.id]);
        rc++;
      }
      // 2) Regras habilitadas
      const rules = (await c.query(`select * from automation.automation_rules where enabled=true`)).rows;
      for (const rule of rules) {
        if (rule.rule_type === 'birthday_contact') {
          const ppl = (await c.query(`select p.id, p.full_name, o.id as org_id, o.name as org_name from crm.people p join public.organizations o on o.id=p.organization_id where p.birthday is not null and to_char(p.birthday,'MM-DD')=to_char(now(),'MM-DD')`)).rows;
          for (const pr of ppl) {
            if (!(await this.tryLog(c, 'rule:birthday_contact', pr.id))) continue;
            const msg = String(rule.template || '').replace(/\{contato\}/g, pr.full_name || 'contato').replace(/\{empresa\}/g, pr.org_name || '');
            await this.dispatch(c, rule.channels || [], { orgId: pr.org_id, orgName: pr.org_name, title: 'Aniversário de contato', message: msg, waInstance: rule.config?.wa_instance, waTo: rule.config?.wa_to, emailTo: rule.config?.email_to });
            ruc++;
          }
        } else if (rule.rule_type === 'contract_anniversary') {
          const milestones: number[] = rule.config?.milestones || [1, 3, 5];
          const orgs = (await c.query(`select id, name, extract(year from age(now(), convertido_em))::int as anos from public.organizations where convertido_em is not null and to_char(convertido_em,'MM-DD')=to_char(now(),'MM-DD')`)).rows;
          for (const o of orgs) {
            if ((o.anos ?? 0) < 1) continue;
            if (!(await this.tryLog(c, 'rule:contract_anniversary', o.id))) continue;
            let msg = String(rule.template || '').replace(/\{empresa\}/g, o.name || '').replace(/\{anos\}/g, String(o.anos));
            if (milestones.includes(o.anos)) msg += ' ⭐ Marco: envie um brinde.';
            await this.dispatch(c, rule.channels || [], { orgId: o.id, orgName: o.name, title: 'Aniversário de contrato', message: msg, waInstance: rule.config?.wa_instance, waTo: rule.config?.wa_to, emailTo: rule.config?.email_to });
            ruc++;
          }
        }
      }
      this.log.log(`dispatch: ${rc} agendamentos, ${ruc} regras`);
      return { reminders: rc, rules: ruc };
    });
  }

  // dedupe por dia: insere no log; se já existe hoje (unique kind+ref+data), devolve false.
  private async tryLog(c: PoolClient, kind: string, refId: string): Promise<boolean> {
    const r = await c.query(`insert into automation.dispatch_log (kind, ref_id, fired_on) values ($1,$2,current_date) on conflict do nothing returning id`, [kind, refId]);
    return (r.rowCount ?? 0) > 0;
  }

  // O sininho do lembrete é para o ADMIN (Crasto): usa a org do criador, senão a org "Crasto.AI".
  private async adminOrg(c: PoolClient, createdBy?: string): Promise<string | null> {
    if (createdBy) { const r = (await c.query(`select organization_id from public.profiles where id=$1`, [createdBy])).rows[0]; if (r?.organization_id) return r.organization_id; }
    const r2 = (await c.query(`select id from public.organizations where name ilike 'Crasto.AI' limit 1`)).rows[0];
    return r2?.id || null;
  }

  private async dispatch(c: PoolClient, channels: string[], ctx: Ctx) {
    try {
      if (channels.includes('sininho')) {
        const org = await this.adminOrg(c, ctx.createdBy);
        if (org) await c.query(`insert into support.notifications (organization_id, channel, title, body) values ($1,'portal',$2,$3)`, [org, ctx.title, ctx.message]);
      }
      if (channels.includes('email')) {
        const to = ctx.emailTo || 'crasto@crasto.com';
        try { await this.email.send(to, `${ctx.title}${ctx.orgName ? ' · ' + ctx.orgName : ''}`, `<p>${esc(ctx.message)}</p>`); } catch (e: any) { this.log.warn(`email: ${e?.message}`); }
      }
      if (channels.includes('whatsapp') && ctx.waInstance && ctx.waTo) {
        try {
          const cfg = (await c.query(`select public.reveal_evolution_global() as r`)).rows[0]?.r;
          if (cfg?.url) await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(ctx.waInstance)}`, { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: ctx.waTo, text: ctx.message }) });
        } catch (e: any) { this.log.warn(`whatsapp: ${e?.message}`); }
      }
    } catch (e: any) { this.log.warn(`dispatch: ${e?.message}`); }
  }
}
