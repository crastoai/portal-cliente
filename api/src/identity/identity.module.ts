import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CrmAccessModule } from '../crm-access/crm-access.module';
import { IdentityController } from './identity.controller';
import { UsersService } from './users.service';
import { IdentityPublicController } from './public.controller';
import { SupportInternalController } from './support-internal.controller';

@Module({
  imports: [CommonModule, CrmAccessModule],
  controllers: [IdentityController, IdentityPublicController, SupportInternalController],
  providers: [UsersService],
})
export class IdentityModule {}
