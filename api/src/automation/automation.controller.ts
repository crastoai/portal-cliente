import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context AUTOMATION (schema automation) — integrações/chaves. ADMIN-ONLY:
// AdminGuard barra não-admin (403); as RPCs (security-definer) revalidam is_crasto_admin.
@Controller('automation')
@UseGuards(JwtOrgGuard, AdminGuard)
export class AutomationController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }

  @Get('integrations')
  list(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select key,display_name,status from automation.integrations order by display_name')).rows); }
  @Get('integrations/status')
  status(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_integrations_status() as r')).rows[0]?.r); }
  @Post('integrations/configure')
  configure(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_set_integration($1,$2,$3,$4) as r', [b.key, b.secret, b.from, b.status])).rows[0]?.r); }
  @Get('integrations/:key/config')
  config(@Req() req: any, @Param('key') key: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_integration_config($1) as r', [key])).rows[0]?.r); }
  @Post('integrations/save')
  saveConfig(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.admin_save_integration($1) as r', [b])).rows[0]?.r); }
}
