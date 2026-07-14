import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CommerceController } from './commerce.controller';

@Module({
  imports: [CommonModule],
  controllers: [CommerceController],
})
export class CommerceModule {}
