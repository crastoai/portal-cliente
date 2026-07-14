import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { IdentityController } from './identity.controller';

@Module({
  imports: [CommonModule],
  controllers: [IdentityController],
})
export class IdentityModule {}
