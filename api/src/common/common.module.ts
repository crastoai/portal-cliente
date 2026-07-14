import { Module } from '@nestjs/common';
import { RlsDbService } from './rls-db.service';
import { JwtOrgGuard } from './jwt-org.guard';
import { AdminGuard } from './admin.guard';

@Module({
  providers: [RlsDbService, JwtOrgGuard, AdminGuard],
  exports: [RlsDbService, JwtOrgGuard, AdminGuard],
})
export class CommonModule {}
