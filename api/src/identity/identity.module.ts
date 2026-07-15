import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { IdentityController } from './identity.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CommonModule],
  controllers: [IdentityController],
  providers: [UsersService],
})
export class IdentityModule {}
