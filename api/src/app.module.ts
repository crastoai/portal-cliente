import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';
import { DeliveryModule } from './delivery/delivery.module';
import { CatalogModule } from './catalog/catalog.module';
import { CrmModule } from './crm/crm.module';
import { CommerceModule } from './commerce/commerce.module';
import { SupportModule } from './support/support.module';
import { AutomationModule } from './automation/automation.module';
import { BillingModule } from './billing/billing.module';
import { FinanceModule } from './finance/finance.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CrmAccessModule } from './crm-access/crm-access.module';

// Middle-end do Portal do Cliente. Contextos DDD entram como módulos, incrementalmente:
// identity → delivery → catalog → crm → commerce → support → automation → finance → billing → analytics.
// crm-access não é um contexto DDD: é a ponte Portal↔WhatsApp CRM (provisionamento de acesso).
@Module({
  imports: [CommonModule, IdentityModule, DeliveryModule, CatalogModule, CrmModule, CommerceModule, SupportModule, AutomationModule, BillingModule, FinanceModule, AnalyticsModule, CrmAccessModule],
  controllers: [HealthController],
})
export class AppModule {}
