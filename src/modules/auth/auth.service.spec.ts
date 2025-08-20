import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const mockUsersService: any = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
    findOne: jest.fn(),
    removeRefreshToken: jest.fn(),
  };

  const mockJwtService: any = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfig: any = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(mockConfig, mockUsersService, mockJwtService as JwtService);
  });

  describe('login', () => {
    it('should return tokens and user on successful login', async () => {
      const plain = 'pass';
      const hashed = await bcrypt.hash(plain, 10);
      const user = { id: '1', email: 'a@b.com', password: hashed, name: 'A', role: 'user' };

      mockUsersService.findByEmail.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const res = await service.login({ email: user.email, password: plain } as any);

      expect(res).toHaveProperty('access_token', 'access-token');
      expect(res).toHaveProperty('refresh_token', 'refresh-token');
      expect(res.user).toMatchObject({ id: '1', email: 'a@b.com', name: 'A', role: 'user' });
      expect(mockUsersService.updateRefreshToken).toHaveBeenCalledWith('1', expect.any(String));
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      await expect(service.login({ email: 'no@one', password: 'x' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const user = { id: '1', email: 'a@b.com', password: 'hash', name: 'A', role: 'user' };
      mockUsersService.findByEmail.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));
      await expect(service.login({ email: user.email, password: 'bad' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('register', () => {
    it('should throw if email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: '1' });
      await expect(
        service.register({ email: 'x', password: 'p', name: 'n' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should create user and return tokens', async () => {
      const created = { id: '2', email: 'new@x.com', name: 'New', role: 'user' };
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(created);
      mockJwtService.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

      const res = await service.register({ email: 'new@x.com', password: 'p', name: 'New' } as any);
      expect(res.user).toMatchObject({ id: '2', email: 'new@x.com', name: 'New', role: 'user' });
      expect(res).toHaveProperty('access_token', 'access');
      expect(res).toHaveProperty('refresh_token', 'refresh');
      expect(mockUsersService.updateRefreshToken).toHaveBeenCalledWith('2', expect.any(String));
    });
  });

  describe('refreshTokens', () => {
    it('should rotate tokens on valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1' });
      const user = { id: '1', email: 'a@b.com', name: 'A', role: 'user', refreshToken: 'hashed' };
      mockUsersService.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');

      const res = await service.refreshTokens({ refreshToken: 'rt' } as any);
      expect(res).toEqual({ access_token: 'new-access', refresh_token: 'new-refresh' });
      expect(mockUsersService.updateRefreshToken).toHaveBeenCalledWith('1', expect.any(String));
    });

    it('should throw ForbiddenException on invalid token (verify throws)', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('bad');
      });
      await expect(service.refreshTokens({ refreshToken: 'bad' } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException and remove refresh token on mismatch', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1' });
      const user = { id: '1', email: 'a@b.com', name: 'A', role: 'user', refreshToken: 'hashed' };
      mockUsersService.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));

      await expect(service.refreshTokens({ refreshToken: 'rt' } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockUsersService.removeRefreshToken).toHaveBeenCalledWith('1');
    });
  });

  describe('logout', () => {
    it('should remove refresh token', async () => {
      await service.logout('1');
      expect(mockUsersService.removeRefreshToken).toHaveBeenCalledWith('1');
    });
  });

  describe('validateUserRoles', () => {
    it('should return false for missing or inactive user', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      expect(await service.validateUserRoles('x')).toBe(false);
      mockUsersService.findOne.mockResolvedValue({ id: '1', isActive: false, role: 'user' });
      expect(await service.validateUserRoles('1')).toBe(false);
    });

    it('should return true when no roles required', async () => {
      mockUsersService.findOne.mockResolvedValue({ id: '1', isActive: true, role: 'user' });
      expect(await service.validateUserRoles('1')).toBe(true);
    });

    it('should check required roles', async () => {
      mockUsersService.findOne.mockResolvedValue({ id: '1', isActive: true, role: 'admin' });
      expect(await service.validateUserRoles('1', ['admin'])).toBe(true);
      expect(await service.validateUserRoles('1', ['user'])).toBe(false);
    });
  });
});
