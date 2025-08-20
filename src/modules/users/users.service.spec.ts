import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  const mockUser: User = {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashedPassword',
    role: 'user',
    tasks: [],
    refreshToken: undefined as unknown as string,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    merge: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve('hashed_password'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      };
      const hashedPassword = 'hashed_password';

      mockRepository.create.mockReturnValue({ ...mockUser, password: hashedPassword });
      mockRepository.save.mockResolvedValue({ ...mockUser, password: hashedPassword });

      const result = await service.create(createUserDto);

      expect(result).toEqual({ ...mockUser, password: hashedPassword });
      expect(repository.create).toHaveBeenCalledWith({
        ...createUserDto,
        password: hashedPassword,
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual({ ...mockUser, password: hashedPassword });
    });
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const users = [mockUser];
      mockRepository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(repository.find).toHaveBeenCalled();
      expect(result).toEqual(users);
    });
  });

  describe('findOne', () => {
    it('should return a user if found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne('1');

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return a user if found by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updateUserDto: UpdateUserDto = {
        name: 'Updated Name',
      };
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.merge.mockReturnValue({ ...mockUser, ...updateUserDto });
      mockRepository.save.mockResolvedValue({ ...mockUser, ...updateUserDto });

      const result = await service.update('1', updateUserDto);

      expect(repository.merge).toHaveBeenCalledWith(mockUser, updateUserDto);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual({ ...mockUser, ...updateUserDto });
    });

    it('should hash password if included in update', async () => {
      const updateUserDto: UpdateUserDto = {
        password: 'newpassword123',
      };
      const hashedPassword = 'newhashedpassword123';

      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.merge.mockReturnValue({ ...mockUser, password: hashedPassword });
      mockRepository.save.mockResolvedValue({ ...mockUser, password: hashedPassword });

      await service.update('1', updateUserDto);

      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a user', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.remove.mockResolvedValue(undefined);

      await service.remove('1');

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(repository.remove).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('updateRefreshToken', () => {
    it('should update user refresh token', async () => {
      const refreshToken = 'newRefreshToken';
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateRefreshToken('1', refreshToken);

      expect(repository.update).toHaveBeenCalledWith('1', { refreshToken });
    });
  });

  describe('findByRefreshToken', () => {
    it('should find active user by refresh token', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByRefreshToken('token');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { refreshToken: 'token', isActive: true },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate a user and remove refresh token', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.deactivateUser('1');

      expect(repository.update).toHaveBeenCalledWith('1', {
        isActive: false,
        refreshToken: undefined,
      });
    });
  });

  describe('removeRefreshToken', () => {
    it('should remove refresh token from user', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.removeRefreshToken('1');

      expect(repository.update).toHaveBeenCalledWith('1', {
        refreshToken: undefined,
      });
    });
  });
});
