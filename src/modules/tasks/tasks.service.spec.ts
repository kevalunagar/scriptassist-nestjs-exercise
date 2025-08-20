import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { QueryRunner, Repository, SelectQueryBuilder } from 'typeorm';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';
import { TaskPriority } from './enums/task-priority.enum';
import { TaskStatus } from './enums/task-status.enum';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let repository: Repository<Task>;
  let queue: Queue;
  let queryRunner: QueryRunner;
  let queryBuilder: SelectQueryBuilder<Task>;

  const mockTask = {
    id: '1',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    dueDate: new Date(),
    userId: '1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockManager = {
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: mockManager,
    } as unknown as QueryRunner;

    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockTask]),
      getCount: jest.fn().mockResolvedValue(1),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        total: '1',
        completed: '0',
        inProgress: '0',
        pending: '1',
        highPriority: '0',
      }),
    } as unknown as SelectQueryBuilder<Task>;

    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      manager: {
        connection: {
          createQueryRunner: jest.fn().mockReturnValue(queryRunner),
        },
      },
    };

    const mockQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockRepository,
        },
        {
          provide: getQueueToken('task-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    repository = module.get<Repository<Task>>(getRepositoryToken(Task));
    queue = module.get<Queue>(getQueueToken('task-processing'));
  });

  describe('create', () => {
    it('should successfully create a task', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(),
        userId: '1',
      };

      (queryRunner.manager.save as any).mockResolvedValue(mockTask);
      const result = await service.create(createTaskDto);

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.save).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(result).toEqual(mockTask);
    });

    it('should rollback transaction on error', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(),
        userId: '1',
      };

      (queryRunner.manager.save as any).mockRejectedValue(new Error('Database error'));

      await expect(service.create(createTaskDto)).rejects.toThrow('Database error');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks with filters', async () => {
      const filterDto: TaskFilterDto = {
        status: TaskStatus.PENDING,
        priority: TaskPriority.HIGH,
        page: 1,
        limit: 10,
      };

      const result = await service.findAll(filterDto);

      expect(result).toEqual({
        items: [mockTask],
        total: 1,
        page: 1,
        pageCount: 1,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledTimes(2);
    });

    it('should handle search term filter', async () => {
      const filterDto: TaskFilterDto = {
        searchTerm: 'test',
        page: 1,
        limit: 10,
      };

      await service.findAll(filterDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(task.title)'),
        expect.any(Object),
      );
    });
  });

  describe('findOne', () => {
    it('should return a task when it exists', async () => {
      (repository.findOne as any).mockResolvedValue(mockTask);

      const result = await service.findOne('1');
      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException when task does not exist', async () => {
      (repository.findOne as any).mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should successfully update a task', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Updated Title',
      };

      (repository.findOne as any).mockResolvedValue(mockTask);
      (queryRunner.manager.save as any).mockResolvedValue({ ...mockTask, ...updateTaskDto });

      const result = await service.update('1', updateTaskDto);

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.save).toHaveBeenCalled();
      expect(result.title).toBe('Updated Title');
    });

    it('should queue status update when status changes', async () => {
      const updateTaskDto: UpdateTaskDto = {
        status: TaskStatus.COMPLETED,
      };

      (repository.findOne as any).mockResolvedValue(mockTask);
      (queryRunner.manager.save as any).mockResolvedValue({ ...mockTask, ...updateTaskDto });

      await service.update('1', updateTaskDto);

      expect(queue.add).toHaveBeenCalledWith(
        'task-status-update',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('remove', () => {
    it('should successfully remove a task', async () => {
      (repository.findOne as any).mockResolvedValue(mockTask);

      await service.remove('1');

      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.remove).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when task does not exist', async () => {
      (repository.findOne as any).mockResolvedValue(null);

      await expect(service.remove('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByStatus', () => {
    it('should return tasks with specified status', async () => {
      await service.findByStatus(TaskStatus.PENDING);

      expect(queryBuilder.where).toHaveBeenCalledWith('task.status = :status', {
        status: TaskStatus.PENDING,
      });
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const result = await service.getStats();

      expect(result).toEqual({
        total: 1,
        completed: 0,
        inProgress: 0,
        pending: 1,
        highPriority: 0,
      });
    });
  });

  describe('batchProcess', () => {
    it('should process multiple tasks for completion', async () => {
      const operations = {
        tasks: ['1', '2'],
        action: 'complete' as const,
      };

      (queryRunner.manager.findOne as any)
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce({ ...mockTask, id: '2' });
      (queryRunner.manager.save as any).mockImplementation(async (_, task) => task);

      const result = await service.batchProcess(operations);

      expect(result.length).toBe(2);
      expect(result[0].success).toBe(true);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should handle errors for individual tasks', async () => {
      const operations = {
        tasks: ['1'],
        action: 'complete' as const,
      };

      (queryRunner.manager.findOne as any).mockRejectedValue(new Error('Task not found'));

      const result = await service.batchProcess(operations);

      expect(result[0].success).toBe(false);
      expect(result[0].error).toBe('Task not found');
    });
  });
});
