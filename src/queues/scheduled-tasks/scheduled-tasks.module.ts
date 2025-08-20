import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from '../../modules/tasks/tasks.module';
import { OverdueTasksService } from './overdue-tasks.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    TasksModule,
  ],
  providers: [OverdueTasksService],
  exports: [OverdueTasksService],
})
export class ScheduledTasksModule {}
