import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { CrmAccessService } from './crm-access.service';

// Aba "Acesso ao WhatsApp CRM" (admin do Portal). ADMIN-ONLY: conceder acesso a um
// CRM de cliente é ato de provisionamento, não self-service — o cliente nunca chega aqui.
// O Bearer do admin é repassado à API do CRM (mesmo IdP), que revalida por conta própria.
@Controller('crm-access')
@UseGuards(JwtOrgGuard, AdminGuard)
export class CrmAccessController {
  constructor(private readonly svc: CrmAccessService) {}
  private auth(req: any): string { return req.headers.authorization; }

  // "Entrar no CRM": mint de um magiclink de USO ÚNICO para o próprio admin (e-mail do JWT).
  // A tela redireciona com esse OTP + escopo — nunca com o bearer. (rota literal antes de :orgId)
  @Post('enter')
  enter(@Req() req: any) { return this.svc.enterLink(req); }

  // Status dos agentes de TODOS os clientes, de uma vez (federado do wacrm). A Visão Geral
  // mostrava "sem agente" para todos porque lia `agents.agents` do banco do PORTAL (vazio) —
  // os agentes vivem no wacrm. Aqui buscamos em BATCH, por org. (rota literal antes de :orgId)
  @Get('agents-overview')
  agentsOverview(@Req() req: any) { return this.svc.agentsOverview(this.auth(req)); }

  @Get(':orgId')
  overview(@Req() req: any, @Param('orgId') orgId: string) { return this.svc.overview(orgId, this.auth(req)); }

  @Put(':orgId/agent')
  linkAgent(@Req() req: any, @Param('orgId') orgId: string, @Body() b: any) {
    return this.svc.linkAgent(req, orgId, this.auth(req), b?.agent_id ?? null);
  }

  @Post(':orgId/users')
  invite(@Req() req: any, @Param('orgId') orgId: string, @Body() b: any) { return this.svc.invite(req, orgId, this.auth(req), b); }

  @Patch(':orgId/users/:id')
  updateUser(@Req() req: any, @Param('orgId') orgId: string, @Param('id') id: string, @Body() b: any) {
    return this.svc.updateUser(req, orgId, this.auth(req), id, { full_name: b?.full_name, email: b?.email, role: b?.role, phone: b?.phone, responsible_agents: b?.responsible_agents });
  }

  @Post(':orgId/users/:id/resend')
  resend(@Req() req: any, @Param('orgId') orgId: string, @Param('id') id: string) { return this.svc.resend(req, orgId, this.auth(req), id); }

  @Delete(':orgId/users/:id')
  revoke(@Req() req: any, @Param('orgId') orgId: string, @Param('id') id: string) { return this.svc.revoke(req, orgId, this.auth(req), id); }

  // ---- Unidades (CNPJs) da empresa — multi-CNPJ (admin gerencia; cliente só escolhe) ----
  @Get(':orgId/units')
  listUnits(@Req() req: any, @Param('orgId') orgId: string) { return this.svc.listUnits(orgId, this.auth(req)); }

  @Post(':orgId/units')
  createUnit(@Req() req: any, @Param('orgId') orgId: string, @Body() b: any) { return this.svc.createUnit(req, orgId, this.auth(req), b); }

  @Put(':orgId/units/:unitId')
  updateUnit(@Req() req: any, @Param('orgId') orgId: string, @Param('unitId') unitId: string, @Body() b: any) {
    return this.svc.updateUnit(req, orgId, this.auth(req), unitId, b);
  }

  @Delete(':orgId/units/:unitId')
  deleteUnit(@Req() req: any, @Param('orgId') orgId: string, @Param('unitId') unitId: string) {
    return this.svc.deleteUnit(req, orgId, this.auth(req), unitId);
  }

  // Vincula um agente a uma unidade (unit_id null → volta pra matriz).
  @Put(':orgId/agents/:id/unit')
  setAgentUnit(@Req() req: any, @Param('orgId') orgId: string, @Param('id') id: string, @Body() b: any) {
    return this.svc.setAgentUnit(req, orgId, this.auth(req), id, b?.unit_id ?? null);
  }

  // Telas do WhatsApp CRM daquele usuário — repassadas ao CRM (dono das próprias telas).
  @Get(':orgId/users/:id/crm-screens')
  getCrmScreens(@Req() req: any, @Param('orgId') orgId: string, @Param('id') id: string) {
    return this.svc.getCrmScreens(orgId, id, this.auth(req));
  }
  @Post(':orgId/users/:id/crm-screens')
  setCrmScreens(@Req() req: any, @Param('orgId') orgId: string, @Param('id') id: string, @Body() b: any) {
    return this.svc.setCrmScreens(orgId, id, this.auth(req), b?.screens ?? []);
  }
}
