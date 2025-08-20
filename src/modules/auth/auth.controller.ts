import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '@common/guards/rate-limit.guard';
import { User } from '@modules/users/entities/user.entity';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Authenticated, CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import {
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  RegisterResponse,
} from './interfaces/auth-responses.interface';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @RateLimit(3, 60000)
  @Post('login')
  login(@Body() loginDto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(loginDto);
  }
  @RateLimit(3, 60000)
  @Post('register')
  register(@Body() registerDto: RegisterDto): Promise<RegisterResponse> {
    return this.authService.register(registerDto);
  }

  @RateLimit(2, 60000)
  @Post('refresh')
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto): Promise<RefreshResponse> {
    return this.authService.refreshTokens(refreshTokenDto);
  }

  @RateLimit(3, 60000)
  @Authenticated()
  @Post('logout')
  async logout(@CurrentUser() user: User): Promise<LogoutResponse> {
    await this.authService.logout(user.id);
    return { message: 'Logged out' };
  }
}
