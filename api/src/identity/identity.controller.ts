import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';
import { UsersService } from './users.service';
import { CrmAccessService } from '../crm-access/crm-access.service';

// Bounded context IDENTITY (schema public + RPCs). TUDO roda em asUser → a RLS do Portal
// decide exatamente o que decidia via PostgREST; a diferença é que o cliente fala com ESTA API,
// nunca com o banco. Admin (is_crasto_admin) enxerga mais pelas policies de bypass (não por header).
@Controller('identity')
@UseGuards(JwtOrgGuard)
export class IdentityController {
  private readonly log = new Logger('Identity');
  constructor(private readonly db: RlsDbService, private readonly users: UsersService, private readonly crmAccess: CrmAccessService) {}
  private uid(req: any): string { return req.user.id; }

  // ── acesso de pessoas ao Portal (substitui as Edge Functions de convite) ──
  // Nenhuma senha é gerada/enviada/exibida: vai um link e a pessoa escolhe a dela.

  /** Admin cria o login de um cliente. */
  @Post('users')
  @UseGuards(AdminGuard)
  createUser(@Req() req: any, @Body() b: any) { return this.users.createByAdmin(req, b); }

  /** Cliente-dono convida alguém da própria empresa (o serviço confere o papel). */
  @Post('users/invite')
  inviteUser(@Req() req: any, @Body() b: any) { return this.users.inviteByOwner(req, this.uid(req), b); }

  /** Admin edita nome / e-mail / papel de um usuário do Portal.
   *  Sincroniza automaticamente com o CRM se a pessoa tem acesso lá. */
  @Patch('users/:id')
  @UseGuards(AdminGuard)
  async updateUser(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    const result = await this.users.updateByAdmin(req, id, { email: b?.email, full_name: b?.full_name, role: b?.role });
    if (!result.ok || (!b?.email && !b?.full_name)) return result;
    const orgId = result.organization_id;
    if (orgId) {
      try {
        await this.crmAccess.updateUser(req, orgId, req.headers.authorization, id, { email: b?.email, full_name: b?.full_name });
      } catch (e: any) {
        this.log.warn(`CRM sync for user ${id}: ${e?.message}`);
        (result as any).crm_sync_error = e?.message || 'Falha ao sincronizar com o CRM';
      }
    }
    return result;
  }

  /** Admin reenvia o acesso — manda link novo, NÃO redefine a senha da pessoa. */
  @Post('users/:id/resend')
  @UseGuards(AdminGuard)
  resendUser(@Req() req: any, @Param('id') id: string) { return this.users.resend(req, id); }

  /** Admin exclui um usuário do Portal (Auth + profiles). */
  @Delete('users/:id')
  @UseGuards(AdminGuard)
  deleteUser(@Req() req: any, @Param('id') id: string) { return this.users.deleteByAdmin(req, id); }

  // UPDATE dinâmico seguro: colunas validadas (só [a-z0-9_]) + valores parametrizados.
  private setClause(patch: Record<string, any>, startAt: number) {
    const keys = Object.keys(patch || {}).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    const sets = keys.map((k, i) => `"${k}"=$${startAt + i}`).join(', ');
    const vals = keys.map((k) => patch[k]);
    return { sets, vals, ok: keys.length > 0 };
  }

  // ── organizations ──
  @Get('org/:id')
  orgById(@Req() req: any, @Param('id') id: string) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.organizations where id=$1', [id])).rows[0] ?? null);
  }
  @Get('organizations/brief')
  brief(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,name from public.organizations order by name')).rows);
  }
  @Get('organizations/proposals')
  proposals(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,name,cnpj,cliente_oculto from public.organizations order by name')).rows);
  }
  @Post('organizations')
  orgCreate(@Req() req: any, @Body() b: any) {
    const { vals, ok } = this.setClause(b, 1);
    return this.db.asUser(this.uid(req), async (c) => {
      if (!ok) return null;
      const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      return (await c.query(`insert into public.organizations (${cols.map((k) => `"${k}"`).join(',')}) values (${ph}) returning id,name`, vals)).rows[0];
    });
  }
  @Patch('org/:id')
  orgUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const { sets, vals, ok } = this.setClause(b, 2);
      if (!ok) return { ok: true };
      await c.query(`update public.organizations set ${sets} where id=$1`, [id, ...vals]);
      return { ok: true };
    });
  }
  @Patch('org/:id/stage')
  orgStage(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => { await c.query('update public.organizations set stage=$2 where id=$1', [id, b.stage ?? null]); return { ok: true }; });
  }
  @Post('org/mine')
  orgUpdateMine(@Req() req: any, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.update_my_org($1) as r', [b])).rows[0]?.r);
  }

  // ── origem/indicação/comissão (INTERNO, owner-only; tabela crm.org_referral, RLS só admin) ──
  @Get('org/:id/referral')
  @UseGuards(AdminGuard)
  orgReferralGet(@Req() req: any, @Param('id') id: string) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from crm.org_referral where organization_id=$1', [id])).rows[0] ?? null);
  }
  @Post('org/:id/referral')
  @UseGuards(AdminGuard)
  orgReferralUpsert(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    const cols = ['origem_canal', 'indicado_por', 'indicado_em', 'comissao_tipo', 'comissao_percent', 'comissao_status', 'captado_por', 'primeiro_contato_em', 'obs',
      'indicado_por_pessoa_nome', 'indicado_por_pessoa_email', 'indicado_por_pessoa_telefone', 'grau_relacao', 'canal', 'rede_social', 'endereco_encontro'];
    const keys = cols.filter((k) => k in (b || {}));
    const vals = keys.map((k) => (b[k] === '' ? null : b[k]));
    return this.db.asUser(this.uid(req), async (c) => {
      if (keys.length === 0) { await c.query('insert into crm.org_referral (organization_id) values ($1) on conflict (organization_id) do nothing', [id]); return { ok: true }; }
      const insCols = ['organization_id', ...keys].map((k) => `"${k}"`).join(',');
      const insVals = [id, ...vals];
      const ph = insVals.map((_, i) => `$${i + 1}`).join(',');
      const upd = keys.map((k, i) => `"${k}"=$${i + 2}`).join(', ');
      await c.query(`insert into crm.org_referral (${insCols}) values (${ph}) on conflict (organization_id) do update set ${upd}, updated_at=now()`, insVals);
      return { ok: true };
    });
  }
  @Get('org/mine/contact')
  myContact(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) => { try { return (await c.query('select * from public.my_org_contact()')).rows[0] ?? null; } catch { return null; } });
  }

  // ── profiles ──
  @Get('profiles/:uid')
  profileById(@Req() req: any, @Param('uid') puid: string) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.profiles where id=$1', [puid])).rows[0] ?? null);
  }
  @Get('profiles')
  profilesByOrg(@Req() req: any, @Query('org') org: string) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,full_name,email,role,avatar_url from public.profiles where organization_id=$1', [org])).rows);
  }
  // Auto-edição do próprio perfil (tela "Meu perfil"). ALLOWLIST DURA: só as colunas que a
  // pessoa realmente edita. NUNCA role/organization_id/id/crm_screens/connector_id — senão
  // qualquer usuário faria PATCH do próprio perfil com role='crasto_admin' e viraria admin da
  // plataforma (a RLS profiles_self_update libera a própria linha, mas não restringe COLUNA).
  // Papéis/permissões: só pela rota admin (updateUser, com AdminGuard). Campos fora da lista são
  // ignorados em silêncio (a UI só manda full_name/avatar_url hoje).
  private static readonly PROFILE_SELF_COLS = new Set(['full_name', 'avatar_url', 'phone', 'locale']);
  @Patch('profiles/:uid')
  async profileUpdate(@Req() req: any, @Param('uid') puid: string, @Body() b: any) {
    const patch: Record<string, any> = {};
    for (const k of Object.keys(b || {})) if (IdentityController.PROFILE_SELF_COLS.has(k)) patch[k] = b[k];
    const result = await this.db.asUser(this.uid(req), async (c) => {
      const { sets, vals, ok } = this.setClause(patch, 2);
      if (!ok) return { ok: true };
      await c.query(`update public.profiles set ${sets} where id=$1`, [puid, ...vals]);
      return { ok: true };
    });
    if (patch.full_name != null && this.uid(req) === puid) {
      try { await this.users.syncNameToAuth(puid, patch.full_name); } catch (e: any) { this.log.warn(`Auth sync name ${puid}: ${e?.message}`); }
      const orgId = await this.db.asService(async (c) => (await c.query('select organization_id from public.profiles where id=$1', [puid])).rows[0]?.organization_id);
      if (orgId) {
        try { await this.crmAccess.updateUser(req, orgId, req.headers.authorization, puid, { full_name: patch.full_name }); } catch (e: any) { this.log.warn(`CRM sync name ${puid}: ${e?.message}`); }
      }
    }
    return result;
  }

  // ── CNPJs (matriz+filiais): cliente via RPC (owner-only), admin lê a tabela crm ──
  @Get('cnpjs/mine')
  cnpjsMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.my_cnpjs()')).rows); }
  @Post('cnpjs')
  cnpjSave(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.save_my_cnpj($1) as r', [b])).rows[0]?.r); }
  @Delete('cnpjs/:id')
  cnpjRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.delete_my_cnpj($1) as r', [id])).rows[0]?.r); }
  @Get('cnpjs/org/:org')
  cnpjsByOrg(@Req() req: any, @Param('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from crm.company_cnpjs where organization_id=$1 order by is_headquarters desc', [org])).rows); }
  @Post('cnpjs/admin')
  cnpjAdminSave(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_registration_upsert($1) as r', [b])).rows[0]?.r); }
  @Delete('cnpjs/admin/:id')
  cnpjAdminRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_registration_delete($1) as r', [id])).rows[0]?.r); }

  // ── sócios ──
  @Get('partners/mine')
  partnersMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.my_partners()')).rows); }
  @Post('partners')
  partnerSave(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.save_my_partner($1) as r', [b])).rows[0]?.r); }
  // Excluir sócio: o DONO usa o RPC (owner-only); o ADMIN apaga direto (a política RLS
  // `partners_admin_all = is_crasto_admin()` permite) — antes o admin não conseguia excluir
  // sócio nenhum na ficha do cliente, nem os cadastrados pelo próprio cliente.
  @Delete('partners/:id')
  partnerRemove(@Req() req: any, @Param('id') id: string) {
    return this.db.asUser(this.uid(req), async (c) => {
      const admin = (await c.query('select public.is_crasto_admin() as a')).rows[0]?.a === true;
      if (admin) { await c.query('delete from crm.company_partners where id=$1', [id]); return { ok: true }; }
      return (await c.query('select public.delete_my_partner($1) as r', [id])).rows[0]?.r;
    });
  }
  @Get('partners/org/:org')
  partnersByOrg(@Req() req: any, @Param('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from crm.company_partners where organization_id=$1 order by is_ceo desc', [org])).rows); }

  // ── documentos do cliente ──
  @Get('docs/mine')
  docsMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.my_documents()')).rows); }
  @Post('docs')
  docAdd(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.add_my_document($1) as r', [b])).rows[0]?.r); }
  @Delete('docs/:id')
  docRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.delete_my_document($1) as r', [id])).rows[0]?.r); }

  // ── connectors (admin via RLS bypass) ──
  @Get('connectors')
  connectorsList(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.connectors order by name')).rows); }
  @Post('connectors')
  connectorCreate(@Req() req: any, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      await c.query(`insert into public.connectors (${cols.map((k) => `"${k}"`).join(',')}) values (${ph})`, cols.map((k) => b[k]));
      return { ok: true };
    });
  }
  @Patch('connectors/:id')
  connectorUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const { sets, vals, ok } = this.setClause(b, 2);
      if (!ok) return { ok: true };
      await c.query(`update public.connectors set ${sets} where id=$1`, [id, ...vals]);
      return { ok: true };
    });
  }
  @Delete('connectors/:id')
  connectorRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from public.connectors where id=$1', [id]); return { ok: true }; }); }

  // ── telas permitidas (menu por permissão) ──
  @Get('screens')
  myScreens(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => { try { return (await c.query('select public.my_screens() as r')).rows[0]?.r ?? null; } catch { return null; } }); }

  // ── me: perfil + org + telas + is_admin em 1 chamada (base do boot) ──
  @Get('me')
  async me(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const profile = (await c.query('select * from public.profiles where id=$1', [this.uid(req)])).rows[0] ?? null;
      const org = profile?.organization_id ? (await c.query('select * from public.organizations where id=$1', [profile.organization_id])).rows[0] ?? null : null;
      let screens: any = null; try { screens = (await c.query('select public.my_screens() as r')).rows[0]?.r ?? null; } catch {}
      let is_admin = false; try { is_admin = (await c.query('select public.is_crasto_admin() as a')).rows[0]?.a === true; } catch {}
      return { profile, org, screens, is_admin };
    });
  }
}
