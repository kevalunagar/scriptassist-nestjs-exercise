import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    try {
      const now = new Date();
      const overdueTasks = await this.tasksRepository.find({
        where: {
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
        select: ['id', 'title', 'dueDate'],
      });
      this.logger.log(`Found ${overdueTasks.length} overdue tasks`);

      if (overdueTasks.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < overdueTasks.length; i += batchSize) {
          const batch = overdueTasks.slice(i, i + batchSize);
          await this.taskQueue.add(
            'overdue-tasks-notification',
            {
              tasks: batch.map(task => ({
                taskId: task.id,
                title: task.title,
                dueDate: task.dueDate,
              })),
            },
            {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
          this.logger.debug(`Added batch of ${batch.length} tasks to the processing queue`);
        }
      }
      this.logger.debug('Overdue tasks check completed successfully');
    } catch (error) {
      this.logger.error(
        `Error checking overdue tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
