import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context DELIVERY (schema delivery). Tudo em asUser → a RLS do Portal faz o "mine"
// (própria org do cliente) e o bypass do admin, exatamente como fazia via PostgREST.
@Controller('delivery')
@UseGuards(JwtOrgGuard)
export class DeliveryController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }
  private set(patch: Record<string, any>, startAt: number) {
    const keys = Object.keys(patch || {}).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
    return { sets: keys.map((k, i) => `"${k}"=$${startAt + i}`).join(', '), vals: keys.map((k) => patch[k]), ok: keys.length > 0 };
  }

  private readonly ROLLOUT = 'id,vdi_module_id,status,label,rollout_progress,rollout_due,rollout_status';

  // ── client_modules ──
  @Get('client-modules/mine')
  cmMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.ROLLOUT} from delivery.client_modules order by created_at`)).rows); }
  @Get('client-modules/all')
  cmAll(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select organization_id from delivery.client_modules')).rows); }
  @Get('client-modules')
  cmByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.ROLLOUT} from delivery.client_modules where organization_id=$1 order by created_at`, [org])).rows); }
  @Post('client-modules')
  cmAttach(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query(`insert into delivery.client_modules (organization_id,vdi_module_id,status) values ($1,$2,'active')`, [b.organization_id, b.vdi_module_id]); return { ok: true }; }); }
  @Post('client-modules/instance')
  cmAddInstance(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query(`insert into delivery.client_modules (organization_id,vdi_module_id,status,label) values ($1,$2,'active',$3)`, [b.organization_id, b.vdi_module_id, b.label ?? null]); return { ok: true }; }); }
  @Delete('client-modules/by/:org/:module')
  cmDetach(@Req() req: any, @Param('org') org: string, @Param('module') module: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.client_modules where organization_id=$1 and vdi_module_id=$2', [org, module]); return { ok: true }; }); }
  @Delete('client-modules/:id')
  cmRemoveInstance(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.client_modules where id=$1', [id]); return { ok: true }; }); }
  @Patch('client-modules/:id/rollout')
  cmRollout(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update delivery.client_modules set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }

  // ── implementations ──
  @Get('implementation/mine')
  implMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select overall_progress,due_date,status,started_at from delivery.implementations limit 1')).rows[0] ?? null); }
  @Get('implementation')
  implByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from delivery.implementations where organization_id=$1 limit 1', [org])).rows[0] ?? null); }
  @Get('implementations/brief')
  implBrief(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select organization_id,overall_progress,status from delivery.implementations')).rows); }
  @Post('implementation/:org')
  implUpsert(@Req() req: any, @Param('org') org: string, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const ex = (await c.query('select id from delivery.implementations where organization_id=$1 limit 1', [org])).rows[0];
      const { sets, vals, ok } = this.set(b, 2);
      if (ex?.id) { if (ok) await c.query(`update delivery.implementations set ${sets} where id=$1`, [ex.id, ...vals]); }
      else {
        const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
        const ph = cols.map((_, i) => `$${i + 2}`).join(',');
        await c.query(`insert into delivery.implementations (organization_id${cols.length ? ',' + cols.map((k) => `"${k}"`).join(',') : ''}) values ($1${cols.length ? ',' + ph : ''})`, [org, ...cols.map((k) => b[k])]);
      }
      return { ok: true };
    });
  }

  // ── system_health (farol) ──
  @Get('health/mine')
  healthMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select status,message from delivery.system_health limit 1')).rows[0] ?? null); }
  @Get('health')
  healthByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select status,message from delivery.system_health where organization_id=$1 limit 1', [org])).rows[0] ?? null); }
  @Get('health/brief')
  healthBrief(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select organization_id,status from delivery.system_health')).rows); }
  @Post('health/:org')
  healthUpsert(@Req() req: any, @Param('org') org: string, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const ex = (await c.query('select id from delivery.system_health where organization_id=$1 limit 1', [org])).rows[0];
      const { sets, vals, ok } = this.set(b, 2);
      if (ex?.id) { if (ok) await c.query(`update delivery.system_health set ${sets} where id=$1`, [ex.id, ...vals]); }
      else {
        const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
        const ph = cols.map((_, i) => `$${i + 2}`).join(',');
        await c.query(`insert into delivery.system_health (organization_id${cols.length ? ',' + cols.map((k) => `"${k}"`).join(',') : ''}) values ($1${cols.length ? ',' + ph : ''})`, [org, ...cols.map((k) => b[k])]);
      }
      return { ok: true };
    });
  }

  // ── project_tasks (Gantt) ──
  @Get('tasks/mine')
  tasksMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from delivery.project_tasks order by sort_order')).rows); }
  @Get('tasks')
  tasksByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from delivery.project_tasks where organization_id=$1 order by sort_order', [org])).rows); }
  @Post('tasks')
  tasksAdd(@Req() req: any, @Body() b: any) {
    return this.db.asUser(this.uid(req), async (c) => {
      const cols = Object.keys(b).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      await c.query(`insert into delivery.project_tasks (${cols.map((k) => `"${k}"`).join(',')}) values (${ph})`, cols.map((k) => b[k]));
      return { ok: true };
    });
  }
  @Patch('tasks/:id')
  tasksUpdate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { const { sets, vals, ok } = this.set(b, 2); if (ok) await c.query(`update delivery.project_tasks set ${sets} where id=$1`, [id, ...vals]); return { ok: true }; }); }
  @Delete('tasks/:id')
  tasksRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.project_tasks where id=$1', [id]); return { ok: true }; }); }

  // ── module_credentials (senha via RPC, cifrada) ──
  @Get('credentials/mine')
  credMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,label,login,sso_enabled,access_url,vdi_module_id,client_module_id from delivery.module_credentials')).rows); }
  @Get('credentials')
  credByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select id,label,login,sso_enabled,access_url,vdi_module_id,client_module_id from delivery.module_credentials where organization_id=$1', [org])).rows); }
  @Post('credentials/set')
  credSet(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query('select public.set_module_access($1,$2,$3,$4,$5,$6) as r', [b.clientModuleId, b.label, b.login, b.secret, b.sso, b.url ?? null])).rows[0]?.r); }
  @Delete('credentials/:id')
  credRemove(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.module_credentials where id=$1', [id]); return { ok: true }; }); }

  // ── client_services ──
  private readonly SVC = 'id,service_id,status,notes,service_name,service_description,service_category,service_unit';
  @Get('services/mine')
  svcMine(@Req() req: any) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.SVC} from delivery.client_services`)).rows); }
  @Get('services')
  svcByOrg(@Req() req: any, @Query('org') org: string) { return this.db.asUser(this.uid(req), async (c) => (await c.query(`select ${this.SVC} from delivery.client_services where organization_id=$1`, [org])).rows); }
  @Post('services')
  svcAttach(@Req() req: any, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query(`insert into delivery.client_services (organization_id,service_id,status,service_name,service_description,service_category,service_unit) values ($1,$2,'active',$3,$4,$5,$6)`, [b.organization_id, b.service_id, b.service_name ?? null, b.service_description ?? null, b.service_category ?? null, b.service_unit ?? null]); return { ok: true }; }); }
  @Delete('services/:id')
  svcDetach(@Req() req: any, @Param('id') id: string) { return this.db.asUser(this.uid(req), async (c) => { await c.query('delete from delivery.client_services where id=$1', [id]); return { ok: true }; }); }
  @Patch('services/:id/status')
  svcStatus(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.db.asUser(this.uid(req), async (c) => { await c.query('update delivery.client_services set status=$2 where id=$1', [id, b.status ?? null]); return { ok: true }; }); }
}
