import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { RlsDbService } from '../common/rls-db.service';

// Bounded context BILLING — faturas do cliente. A fonte (finance.accounts) NÃO é exposta;
// o cliente lê só as próprias via RPC my_faturas (security-definer, escopado à sua org).
@Controller('billing')
@UseGuards(JwtOrgGuard)
export class BillingController {
  constructor(private readonly db: RlsDbService) {}
  private uid(req: any): string { return req.user.id; }

  @Get('invoices/mine')
  invoicesMine(@Req() req: any) {
    return this.db.asUser(this.uid(req), async (c) => (await c.query('select * from public.my_faturas()')).rows);
  }
}
