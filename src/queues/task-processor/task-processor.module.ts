import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { TaskProcessorService } from './task-processor.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    TasksModule,
  ],
  providers: [TaskProcessorService],
  exports: [TaskProcessorService],
})
export class TaskProcessorModule {}
