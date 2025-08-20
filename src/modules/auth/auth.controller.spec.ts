import { User } from '@modules/users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import {
  LoginResponse,
  RefreshResponse,
  RegisterResponse,
} from './interfaces/auth-responses.interface';

describe('AuthController', () => {
  let controller: AuthController;
  const mockAuthService: Partial<Record<keyof AuthService, jest.Mock>> = {
    login: jest.fn(),
    register: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(mockAuthService as unknown as AuthService);
  });

  describe('login', () => {
    it('should call authService.login and return its result', async () => {
      const dto: LoginDto = { email: 'a@b.com', password: 'p' } as any;
      const expected: LoginResponse = {
        access_token: 'a',
        refresh_token: 'r',
        user: { id: '1', email: 'a@b.com', name: 'A', role: 'user' },
      };

      (mockAuthService.login as jest.Mock).mockResolvedValue(expected);

      const res = await controller.login(dto);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(res).toBe(expected);
    });

    it('should propagate errors from authService.login', async () => {
      const dto: LoginDto = { email: 'x', password: 'p' } as any;
      (mockAuthService.login as jest.Mock).mockRejectedValue(new Error('fail'));
      await expect(controller.login(dto)).rejects.toThrow('fail');
    });
  });

  describe('register', () => {
    it('should call authService.register and return its result', async () => {
      const dto: RegisterDto = { email: 'n@x.com', password: 'p', name: 'N' } as any;
      const expected: RegisterResponse = {
        access_token: 'a',
        refresh_token: 'r',
        user: { id: '2', email: 'n@x.com', name: 'N', role: 'user' },
      };

      (mockAuthService.register as jest.Mock).mockResolvedValue(expected);

      const res = await controller.register(dto);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(res).toBe(expected);
    });

    it('should propagate errors from authService.register', async () => {
      const dto: RegisterDto = { email: 'n', password: 'p', name: 'N' } as any;
      (mockAuthService.register as jest.Mock).mockRejectedValue(new Error('bad'));
      await expect(controller.register(dto)).rejects.toThrow('bad');
    });
  });

  describe('refreshToken', () => {
    it('should call authService.refreshTokens and return its result', async () => {
      const dto: RefreshTokenDto = { refreshToken: 'rt' } as any;
      const expected: RefreshResponse = { access_token: 'ax', refresh_token: 'rf' };
      (mockAuthService.refreshTokens as jest.Mock).mockResolvedValue(expected);

      const res = await controller.refreshToken(dto);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(dto);
      expect(res).toBe(expected);
    });

    it('should propagate errors from authService.refreshTokens', async () => {
      const dto: RefreshTokenDto = { refreshToken: 'bad' } as any;
      (mockAuthService.refreshTokens as jest.Mock).mockRejectedValue(new Error('no'));
      await expect(controller.refreshToken(dto)).rejects.toThrow('no');
    });
  });

  describe('logout', () => {
    it('should call authService.logout and return message', async () => {
      const user: User = {
        id: '1',
        email: 'a@b.com',
        name: 'A',
        password: 'p',
        role: 'user',
        tasks: [],
      } as any;
      (mockAuthService.logout as jest.Mock).mockResolvedValue(undefined);

      const res = await controller.logout(user);
      expect(mockAuthService.logout).toHaveBeenCalledWith(user.id);
      expect(res).toEqual({ message: 'Logged out' });
    });

    it('should propagate errors from authService.logout', async () => {
      const user: User = {
        id: '1',
        email: 'a@b.com',
        name: 'A',
        password: 'p',
        role: 'user',
        tasks: [],
      } as any;
      (mockAuthService.logout as jest.Mock).mockRejectedValue(new Error('boom'));
      await expect(controller.logout(user)).rejects.toThrow('boom');
    });
  });
});
