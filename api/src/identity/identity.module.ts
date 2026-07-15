import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { IdentityController } from './identity.controller';
import { UsersService } from './users.service';
import { IdentityPublicController } from './public.controller';

@Module({
  imports: [CommonModule],
  controllers: [IdentityController, IdentityPublicController],
  providers: [UsersService],
})
export class IdentityModule {}
