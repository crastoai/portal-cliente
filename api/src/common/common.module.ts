import { Module } from '@nestjs/common';
import { RlsDbService } from './rls-db.service';
import { JwtOrgGuard } from './jwt-org.guard';
import { AdminGuard } from './admin.guard';
import { EmailService } from './email.service';
import { IdpService } from './idp.service';

@Module({
  providers: [RlsDbService, JwtOrgGuard, AdminGuard, EmailService, IdpService],
  exports: [RlsDbService, JwtOrgGuard, AdminGuard, EmailService, IdpService],
})
export class CommonModule {}
