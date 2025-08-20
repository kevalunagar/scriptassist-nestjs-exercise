import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskPriority } from './enums/task-priority.enum';
import { TaskStatus } from './enums/task-status.enum';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

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

  const mockTasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStats: jest.fn(),
    batchProcess: jest.fn(),
  };

  beforeEach(async () => {
    const mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedisClient,
        },
        Reflector,
        RateLimitGuard,
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  describe('create', () => {
    it('should create a new task', async () => {
      const createTaskDto: CreateTaskDto = {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(),
        userId: '1',
      };

      mockTasksService.create.mockResolvedValue(mockTask);

      const result = await controller.create(createTaskDto);
      expect(result).toEqual(mockTask);
      expect(service.create).toHaveBeenCalledWith(createTaskDto);
    });
  });

  describe('findAll', () => {
    it('should return filtered and paginated tasks', async () => {
      const filterDto: TaskFilterDto = {
        status: TaskStatus.PENDING,
        priority: TaskPriority.HIGH,
        page: 1,
        limit: 10,
      };

      const expectedResult = {
        items: [mockTask],
        total: 1,
        page: 1,
        pageCount: 1,
      };

      mockTasksService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(filterDto);
      expect(result).toEqual(expectedResult);
      expect(service.findAll).toHaveBeenCalledWith(filterDto);
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      mockTasksService.findOne.mockResolvedValue(mockTask);

      const result = await controller.findOne('1');
      expect(result).toEqual(mockTask);
      expect(service.findOne).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when task is not found', async () => {
      mockTasksService.findOne.mockResolvedValue(null);

      await expect(controller.findOne('1')).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('should update a task', async () => {
      const updateTaskDto: UpdateTaskDto = {
        title: 'Updated Title',
      };

      mockTasksService.update.mockResolvedValue({ ...mockTask, ...updateTaskDto });

      const result = await controller.update('1', updateTaskDto);
      expect(result.title).toBe('Updated Title');
      expect(service.update).toHaveBeenCalledWith('1', updateTaskDto);
    });
  });

  describe('remove', () => {
    it('should remove a task and return no content', async () => {
      mockTasksService.remove.mockResolvedValue(undefined);

      await controller.remove('1');
      expect(service.remove).toHaveBeenCalledWith('1');
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      const stats = {
        total: 10,
        completed: 5,
        inProgress: 3,
        pending: 2,
        highPriority: 4,
      };

      mockTasksService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats();
      expect(result).toEqual(stats);
      expect(service.getStats).toHaveBeenCalled();
    });
  });

  describe('batchProcess', () => {
    it('should process multiple tasks', async () => {
      const operations = {
        tasks: ['1', '2'],
        action: 'complete' as const,
      };

      const batchResult = [
        { taskId: '1', success: true, result: mockTask },
        { taskId: '2', success: true, result: mockTask },
      ];

      mockTasksService.batchProcess.mockResolvedValue(batchResult);

      const result = await controller.batchProcess(operations);
      expect(result).toEqual(batchResult);
      expect(service.batchProcess).toHaveBeenCalledWith(operations);
    });

    it('should throw BadRequestException for invalid operations', async () => {
      const invalidOperations = {
        tasks: [],
        action: 'complete' as const,
      };

      await expect(controller.batchProcess(invalidOperations)).rejects.toThrow(HttpException);
    });

    it('should throw BadRequestException for invalid action', async () => {
      const invalidOperations = {
        tasks: ['1'],
        action: 'invalid' as 'complete' | 'delete',
      };

      await expect(controller.batchProcess(invalidOperations)).rejects.toThrow(HttpException);
    });
  });
});
