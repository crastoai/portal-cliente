import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RlsDbService } from './rls-db.service';
import { JwtOrgGuard } from './jwt-org.guard';
import { AdminGuard } from './admin.guard';
import { FinanceAccessGuard } from './finance-access.guard';
import { EmailService } from './email.service';
import { IdpService } from './idp.service';
import { AuditService } from './audit.service';
import { InternalController } from './internal.controller';
import { SessionEnforcementInterceptor } from './session-enforcement.interceptor';

@Module({
  controllers: [InternalController],
  providers: [
    RlsDbService, JwtOrgGuard, AdminGuard, FinanceAccessGuard, EmailService, IdpService, AuditService,
    // ENFORCEMENT global do break de 30 min (relógio de ponto). DI completa (RlsDbService).
    { provide: APP_INTERCEPTOR, useClass: SessionEnforcementInterceptor },
  ],
  exports: [RlsDbService, JwtOrgGuard, AdminGuard, FinanceAccessGuard, EmailService, IdpService, AuditService],
})
export class CommonModule {}
