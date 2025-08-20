import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { TasksService } from '../../modules/tasks/tasks.service';

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);
  static concurrency = 3;
  static maxRetries = 3;

  constructor(
    private readonly tasksService: TasksService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job): Promise<{ success: boolean; data?: any; error?: string }> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    try {
      if (job.attemptsMade > 0) {
        this.logger.warn(`Retry attempt ${job.attemptsMade} for job ${job.id}`);
        await new Promise(resolve =>
          setTimeout(resolve, Math.min(1000 * Math.pow(2, job.attemptsMade), 30000)),
        );
      }
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing job ${job.id}: ${errorMessage}`);
      if (job.attemptsMade < TaskProcessorService.maxRetries) {
        throw error;
      }
      return {
        success: false,
        error: `Job failed after ${TaskProcessorService.maxRetries} retries: ${errorMessage}`,
      };
    }
  }

  private async handleStatusUpdate(
    job: Job,
  ): Promise<{ success: boolean; taskId?: string; newStatus?: TaskStatus; error?: string }> {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }

    if (!Object.values(TaskStatus).includes(status)) {
      return {
        success: false,
        error: `Invalid status value. Must be one of: ${Object.values(TaskStatus).join(', ')}`,
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await this.tasksService.updateStatus(taskId, status);
      await queryRunner.commitTransaction();

      return {
        success: true,
        taskId: task.id,
        newStatus: task.status,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async handleOverdueTasks(
    job: Job,
  ): Promise<{ success: boolean; processedCount?: number; error?: string }> {
    const BATCH_SIZE = 100; // Process 100 tasks at a time
    this.logger.debug('Processing overdue tasks notification');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let processedCount = 0;
      let hasMore = true;

      while (hasMore) {
        const tasks = await this.tasksService.findOverdueTasks(BATCH_SIZE, processedCount);

        if (tasks.length === 0) {
          hasMore = false;
          continue;
        }

        await Promise.all(
          tasks.map((task: Task) => this.tasksService.updateStatus(task.id, TaskStatus.PENDING)),
        );

        processedCount += tasks.length;
        this.logger.debug(`Processed ${processedCount} overdue tasks`);

        if (tasks.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      await queryRunner.commitTransaction();
      return { success: true, processedCount };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
