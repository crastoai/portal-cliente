import { Module } from '@nestjs/common';
import { RlsDbService } from './rls-db.service';
import { JwtOrgGuard } from './jwt-org.guard';
import { AdminGuard } from './admin.guard';
import { EmailService } from './email.service';
import { IdpService } from './idp.service';
import { AuditService } from './audit.service';
import { InternalController } from './internal.controller';

@Module({
  controllers: [InternalController],
  providers: [RlsDbService, JwtOrgGuard, AdminGuard, EmailService, IdpService, AuditService],
  exports: [RlsDbService, JwtOrgGuard, AdminGuard, EmailService, IdpService, AuditService],
})
export class CommonModule {}
