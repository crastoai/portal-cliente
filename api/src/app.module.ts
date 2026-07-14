import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';
import { DeliveryModule } from './delivery/delivery.module';
import { CatalogModule } from './catalog/catalog.module';
import { CrmModule } from './crm/crm.module';
import { CommerceModule } from './commerce/commerce.module';

// Middle-end do Portal do Cliente. Contextos DDD entram como módulos, incrementalmente:
// identity → delivery → catalog → crm → commerce → support → automation → finance → billing → analytics.
@Module({
  imports: [CommonModule, IdentityModule, DeliveryModule, CatalogModule, CrmModule, CommerceModule],
  controllers: [HealthController],
})
export class AppModule {}
