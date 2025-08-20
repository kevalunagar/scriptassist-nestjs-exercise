import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export const RateLimit = (limit: number, windowMs: number) => {
  return SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });
};
