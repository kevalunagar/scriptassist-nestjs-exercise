import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskPriority } from '../../modules/tasks/enums/task-priority.enum';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { User } from '../../modules/users/entities/user.entity';
import { OverdueTasksService } from './overdue-tasks.service';

describe('OverdueTasksService', () => {
  let service: OverdueTasksService;
  let taskQueue: jest.Mocked<Queue>;
  let tasksRepository: jest.Mocked<Repository<Task>>;

  beforeEach(async () => {
    const queueMock = {
      add: jest.fn(),
    };

    const repositoryMock = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverdueTasksService,
        {
          provide: getQueueToken('task-processing'),
          useValue: queueMock,
        },
        {
          provide: getRepositoryToken(Task),
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<OverdueTasksService>(OverdueTasksService);
    taskQueue = module.get(getQueueToken('task-processing'));
    tasksRepository = module.get(getRepositoryToken(Task));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkOverdueTasks', () => {
    it('should find overdue tasks with correct query parameters', async () => {
      const mockDate = new Date('2025-08-20T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);
      tasksRepository.find.mockResolvedValue([]);

      await service.checkOverdueTasks();

      expect(tasksRepository.find).toHaveBeenCalledWith({
        where: {
          dueDate: expect.any(Object),
          status: TaskStatus.PENDING,
        },
        select: ['id', 'title', 'dueDate'],
      });

      jest.useRealTimers();
    });

    it('should not add tasks to queue when no overdue tasks found', async () => {
      tasksRepository.find.mockResolvedValue([]);

      await service.checkOverdueTasks();

      expect(taskQueue.add).not.toHaveBeenCalled();
    });

    it('should process tasks in batches of 100', async () => {
      const mockTasks: Task[] = Array(150)
        .fill(null)
        .map((_, index) => {
          const task = new Task();
          task.id = (index + 1).toString();
          task.title = `Task ${index + 1}`;
          task.description = 'Test description';
          task.status = TaskStatus.PENDING;
          task.priority = TaskPriority.MEDIUM;
          task.userId = '1';
          task.dueDate = new Date();
          task.createdAt = new Date();
          task.updatedAt = new Date();
          const mockUser = new User();
          mockUser.id = '1';
          mockUser.email = 'test@test.com';
          mockUser.name = 'Test User';
          mockUser.password = 'hashedPassword';
          mockUser.role = 'user';
          mockUser.tasks = [];
          mockUser.refreshToken = '';
          mockUser.createdAt = new Date();
          mockUser.updatedAt = new Date();
          task.user = mockUser;
          return task;
        });
      tasksRepository.find.mockResolvedValue(mockTasks);

      await service.checkOverdueTasks();

      expect(taskQueue.add).toHaveBeenCalledTimes(2);
      expect(taskQueue.add).toHaveBeenCalledWith(
        'overdue-tasks-notification',
        {
          tasks: expect.arrayContaining(
            mockTasks.slice(0, 100).map(task => ({
              taskId: task.id,
              title: task.title,
              dueDate: task.dueDate,
            })),
          ),
        },
        expect.any(Object),
      );

      expect(taskQueue.add).toHaveBeenCalledWith(
        'overdue-tasks-notification',
        {
          tasks: expect.arrayContaining(
            mockTasks.slice(100).map(task => ({
              taskId: task.id,
              title: task.title,
              dueDate: task.dueDate,
            })),
          ),
        },
        expect.any(Object),
      );
    });

    it('should use correct job options when adding tasks to queue', async () => {
      const mockUser = new User();
      mockUser.id = '1';
      mockUser.email = 'test@test.com';
      mockUser.name = 'Test User';
      mockUser.password = 'hashedPassword';
      mockUser.role = 'user';
      mockUser.tasks = [];
      mockUser.refreshToken = '';
      mockUser.createdAt = new Date();
      mockUser.updatedAt = new Date();

      const mockTasks = [
        {
          id: '1',
          title: 'Test Task',
          description: 'Test description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          userId: '1',
          dueDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          user: mockUser,
        } as Task,
      ];
      tasksRepository.find.mockResolvedValue(mockTasks);

      await service.checkOverdueTasks();

      expect(taskQueue.add).toHaveBeenCalledWith('overdue-tasks-notification', expect.any(Object), {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      tasksRepository.find.mockRejectedValue(mockError);

      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      await service.checkOverdueTasks();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error checking overdue tasks: Database connection failed',
        expect.any(String),
      );
      expect(taskQueue.add).not.toHaveBeenCalled();
    });
  });
});
