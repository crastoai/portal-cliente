import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';
import { DeliveryModule } from './delivery/delivery.module';
import { CatalogModule } from './catalog/catalog.module';

// Middle-end do Portal do Cliente. Contextos DDD entram como módulos, incrementalmente:
// identity → delivery → catalog → commerce → support → automation → finance → billing → analytics.
@Module({
  imports: [CommonModule, IdentityModule, DeliveryModule, CatalogModule],
  controllers: [HealthController],
})
export class AppModule {}
