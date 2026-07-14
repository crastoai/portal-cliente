import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { SupportController } from './support.controller';

@Module({
  imports: [CommonModule],
  controllers: [SupportController],
})
export class SupportModule {}
