import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskProcessorService } from './task-processor.service';

describe('TaskProcessorService', () => {
  let service: TaskProcessorService;
  let _tasksService: TasksService;
  let _dataSource: DataSource;

  const mockTasksService = {
    updateStatus: jest.fn(),
    updateStatusWithManager: jest.fn(),
    findOverdueTasks: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskProcessorService,
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TaskProcessorService>(TaskProcessorService);
    _tasksService = module.get<TasksService>(TasksService);
    _dataSource = module.get<DataSource>(DataSource);
  });

  describe('process', () => {
    it('should process task-status-update job successfully', async () => {
      const mockJob = {
        id: '1',
        name: 'task-status-update',
        data: { taskId: '1', status: TaskStatus.COMPLETED },
        attemptsMade: 0,
      } as Job;

      const mockTask = { id: '1', status: TaskStatus.COMPLETED };
      mockTasksService.updateStatusWithManager.mockResolvedValue(mockTask);

      const result = await service.process(mockJob);

      expect(result).toEqual({
        success: true,
        taskId: mockTask.id,
        newStatus: mockTask.status,
      });
    });

    it('should handle retry with exponential backoff', async () => {
      const mockJob = {
        id: '1',
        name: 'task-status-update',
        data: { taskId: '1', status: TaskStatus.COMPLETED },
        attemptsMade: 1,
      } as Job;

      const mockTask = { id: '1', status: TaskStatus.COMPLETED };
      mockTasksService.updateStatusWithManager.mockResolvedValue(mockTask);

      const result = await service.process(mockJob);

      expect(result).toEqual({
        success: true,
        taskId: mockTask.id,
        newStatus: mockTask.status,
      });
    });
  });

  describe('handleStatusUpdate', () => {
    it('should update task status successfully', async () => {
      const mockJob = {
        data: { taskId: '1', status: TaskStatus.COMPLETED },
      } as Job;

      const mockTask = { id: '1', status: TaskStatus.COMPLETED };
      mockTasksService.updateStatus.mockResolvedValue(mockTask);

      const result = await service['handleStatusUpdate'](mockJob);

      expect(result).toEqual({
        success: true,
        taskId: mockTask.id,
        newStatus: mockTask.status,
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should handle invalid status value', async () => {
      const mockJob = {
        data: { taskId: '1', status: 'INVALID_STATUS' },
      } as Job;

      const result = await service['handleStatusUpdate'](mockJob);

      expect(result.success).toBeFalsy();
      expect(result.error).toContain('Invalid status value');
    });

    it('should handle missing required data', async () => {
      const mockJob = {
        data: {},
      } as Job;

      const result = await service['handleStatusUpdate'](mockJob);

      expect(result.success).toBeFalsy();
      expect(result.error).toBe('Missing required data');
    });
  });

  describe('handleOverdueTasks', () => {
    it('should process overdue tasks in batches', async () => {
      const mockJob = {} as Job;
      const firstBatchTasks = [
        { id: '1', status: TaskStatus.PENDING },
        { id: '2', status: TaskStatus.PENDING },
      ] as Task[];
      const secondBatchTasks = [] as Task[];

      mockTasksService.findOverdueTasks.mockClear();

      mockTasksService.findOverdueTasks.mockImplementation((limit: number, offset: number) => {
        if (offset === 0) {
          return Promise.resolve(firstBatchTasks);
        }
        return Promise.resolve(secondBatchTasks);
      });

      mockTasksService.updateStatus.mockResolvedValue({ status: TaskStatus.PENDING });

      const result = await service['handleOverdueTasks'](mockJob);

      expect(result).toEqual({
        success: true,
        processedCount: 2,
      });

      expect(mockTasksService.findOverdueTasks).toHaveBeenCalledWith(100, 0);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should handle empty task list', async () => {
      const mockJob = {} as Job;

      mockTasksService.findOverdueTasks.mockReset();
      mockTasksService.findOverdueTasks.mockResolvedValueOnce([]);

      const result = await service['handleOverdueTasks'](mockJob);

      expect(result).toEqual({
        success: true,
        processedCount: 0,
      });
      expect(mockTasksService.findOverdueTasks).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });
  });
});
