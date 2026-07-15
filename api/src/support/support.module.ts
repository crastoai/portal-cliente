import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { SupportController } from './support.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [CommonModule],
  controllers: [SupportController],
  providers: [TicketsService],
})
export class SupportModule {}
