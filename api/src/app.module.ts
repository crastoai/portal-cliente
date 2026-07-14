import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthController } from './health/health.controller';

// Middle-end do Portal do Cliente. Contextos DDD entram como módulos, incrementalmente:
// identity → delivery → catalog → commerce → support → automation → finance → billing → analytics.
@Module({
  imports: [CommonModule],
  controllers: [HealthController],
})
export class AppModule {}
