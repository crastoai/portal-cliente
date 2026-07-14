import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context FINANCE (schema finance — NÃO exposto ao PostgREST) — Contas a Pagar/Receber,
// custos, tesouraria, custo de IA. 🔒 ADMIN-ONLY: AdminGuard barra não-admin (403); todo acesso via
// RPC SECURITY DEFINER que revalida is_crasto_admin. O dado sensível (margem/comissão) nunca sai por RLS.
@Controller('finance')
@UseGuards(JwtOrgGuard, AdminGuard)
export class FinanceController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  private bool(v: any): boolean | null { return v === 'true' ? true : v === 'false' ? false : null; }

  // ── contas (payable/receivable) ──
  @Get('accounts')
  accounts(@Req() req: any, @Query('type') type: string, @Query('status') status: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.fin_accounts($1,$2)', [type || null, status || null])).rows); }
  @Post('accounts')
  accountSave(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_account_upsert($1) as r', [b])).rows[0]?.r); }
  @Delete('accounts/:id')
  accountDelete(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_account_delete($1) as r', [id])).rows[0]?.r); }

  // ── custos operacionais ──
  @Get('costs')
  costs(@Req() req: any, @Query('active') active: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.fin_costs($1)', [this.bool(active)])).rows); }
  @Post('costs')
  costSave(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_cost_upsert($1) as r', [b])).rows[0]?.r); }
  @Delete('costs/:id')
  costDelete(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_cost_delete($1) as r', [id])).rows[0]?.r); }

  // ── tesouraria (income/expense) ──
  @Get('transactions')
  transactions(@Req() req: any, @Query('type') type: string, @Query('status') status: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.fin_transactions($1,$2)', [type || null, status || null])).rows); }
  @Post('transactions')
  txSave(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_transaction_upsert($1) as r', [b])).rows[0]?.r); }
  @Delete('transactions/:id')
  txDelete(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_transaction_delete($1) as r', [id])).rows[0]?.r); }

  // ── custo de IA (painel) ──
  @Get('ai-cost')
  aiCost(@Req() req: any, @Query('from') from: string, @Query('to') to: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_ai_cost($1,$2) as r', [from || null, to || null])).rows[0]?.r ?? {}); }
  @Post('ai-cost')
  aiCostSave(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_ai_cost_upsert($1) as r', [b])).rows[0]?.r); }
  @Delete('ai-cost/:id')
  aiCostDelete(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.fin_ai_cost_delete($1) as r', [id])).rows[0]?.r); }
}
