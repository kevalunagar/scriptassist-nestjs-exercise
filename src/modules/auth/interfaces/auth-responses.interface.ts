import { AuthUser } from './auth-user.interface';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface LoginResponse extends TokenPair {
  user: AuthUser;
}

export interface RegisterResponse extends TokenPair {
  user: AuthUser;
}

export interface RefreshResponse extends TokenPair {}

export interface LogoutResponse {
  message: string;
}
