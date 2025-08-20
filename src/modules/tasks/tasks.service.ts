import { InjectQueue } from '@nestjs/bullmq';
import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { EntityManager, Repository } from 'typeorm';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';
import { TaskPriority } from './enums/task-priority.enum';
import { TaskStatus } from './enums/task-status.enum';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(Task, task);
      try {
        await this.enqueueWithRetry('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        });
      } catch (queueError) {
        console.error('Failed to add task to queue after retries:', queueError);
      }
      await queryRunner.commitTransaction();
      return savedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    filterDto: TaskFilterDto,
  ): Promise<{ items: Task[]; total: number; page: number; pageCount: number }> {
    const {
      status,
      priority,
      searchTerm,
      userId,
      dueDateStart,
      dueDateEnd,
      page = 1,
      limit = 10,
    } = filterDto;

    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .select();

    if (status) {
      queryBuilder.andWhere('task.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority });
    }

    if (searchTerm) {
      queryBuilder.andWhere(
        '(LOWER(task.title) LIKE LOWER(:search) OR LOWER(task.description) LIKE LOWER(:search))',
        { search: `%${searchTerm}%` },
      );
    }

    if (userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId });
    }

    if (dueDateStart) {
      queryBuilder.andWhere('task.dueDate >= :dueDateStart', {
        dueDateStart: new Date(dueDateStart),
      });
    }

    if (dueDateEnd) {
      queryBuilder.andWhere('task.dueDate <= :dueDateEnd', {
        dueDateEnd: new Date(dueDateEnd),
      });
    }

    const total = await queryBuilder.getCount();
    const pageCount = Math.ceil(total / limit);

    const items = await queryBuilder
      .orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      items,
      total,
      page,
      pageCount,
    };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await this.findOne(id);
      const originalStatus = task.status;
      Object.assign(task, updateTaskDto);
      const updatedTask = await queryRunner.manager.save(Task, task);
      if (originalStatus !== updatedTask.status) {
        try {
          await this.enqueueWithRetry('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        } catch (queueError) {
          console.error('Failed to add status update to queue after retries:', queueError);
        }
      }

      await queryRunner.commitTransaction();
      return updatedTask;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await this.findOne(id);
      await queryRunner.manager.remove(Task, task);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.status = :status', { status })
      .getMany();
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status;
    return this.tasksRepository.save(task);
  }

  async updateStatusWithManager(
    id: string,
    status: TaskStatus,
    manager: EntityManager,
  ): Promise<Task> {
    const task = await manager.findOne(Task, { where: { id } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    task.status = status;
    return manager.save(Task, task);
  }

  private async enqueueWithRetry(
    name: string,
    data: unknown,
    attempts = 3,
    backoffMs = 500,
  ): Promise<void> {
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        await this.taskQueue.add(name, data, { removeOnComplete: true, attempts: 3 });
        return;
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
      }
    }
    throw lastErr;
  }

  async getStats() {
    const stats = await this.tasksRepository
      .createQueryBuilder('task')
      .select([
        'COUNT(*) as total',
        'COUNT(CASE WHEN status = :completed THEN 1 END) as completed',
        'COUNT(CASE WHEN status = :inProgress THEN 1 END) as inProgress',
        'COUNT(CASE WHEN status = :pending THEN 1 END) as pending',
        'COUNT(CASE WHEN priority = :highPriority THEN 1 END) as highPriority',
      ])
      .setParameters({
        completed: TaskStatus.COMPLETED,
        inProgress: TaskStatus.IN_PROGRESS,
        pending: TaskStatus.PENDING,
        highPriority: TaskPriority.HIGH,
      })
      .getRawOne();

    return {
      total: Number(stats.total),
      completed: Number(stats.completed),
      inProgress: Number(stats.inProgress),
      pending: Number(stats.pending),
      highPriority: Number(stats.highPriority),
    };
  }

  async batchProcess(operations: { tasks: string[]; action: 'complete' | 'delete' }) {
    const { tasks: taskIds, action } = operations;
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const results = [];

    try {
      for (const taskId of taskIds) {
        try {
          let result;

          if (action === 'complete') {
            const task = await queryRunner.manager.findOne(Task, { where: { id: taskId } });
            if (!task) {
              throw new NotFoundException(`Task ${taskId} not found`);
            }
            task.status = TaskStatus.COMPLETED;
            result = await queryRunner.manager.save(Task, task);

            try {
              await this.taskQueue.add(
                'task-status-update',
                {
                  taskId: task.id,
                  status: task.status,
                },
                {
                  removeOnComplete: true,
                  attempts: 3,
                },
              );
            } catch (queueError) {
              console.error('Failed to add status update to queue:', queueError);
            }
          } else {
            const task = await queryRunner.manager.findOne(Task, { where: { id: taskId } });
            if (!task) {
              throw new NotFoundException(`Task ${taskId} not found`);
            }
            await queryRunner.manager.remove(Task, task);
            result = { id: taskId, deleted: true };
          }

          results.push({ taskId, success: true, result });
        } catch (error) {
          results.push({
            taskId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      await queryRunner.commitTransaction();
      return results;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new HttpException('Batch processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  async findOverdueTasks(limit: number, offset: number = 0): Promise<Task[]> {
    return this.tasksRepository
      .createQueryBuilder('task')
      .where('task.dueDate < :now', { now: new Date() })
      .andWhere('task.status != :completed', { completed: TaskStatus.COMPLETED })
      .orderBy('task.dueDate', 'ASC')
      .take(limit)
      .skip(offset)
      .getMany();
  }
}
