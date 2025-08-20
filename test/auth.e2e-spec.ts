import { ResponseTransformInterceptor } from '@common/interceptors/response.interceptor';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseTransformInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a user and return tokens', async () => {
      const payload = { email: 'e2e+1@example.com', password: 'password', name: 'E2E' };

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(201);
      expect(res.body).toHaveProperty('data.access_token');
      expect(res.body).toHaveProperty('data.refresh_token');
      expect(res.body.data.user).toMatchObject({ email: payload.email, name: payload.name });
    });
  });

  describe('POST /auth/login', () => {
    it('should login and return tokens', async () => {
      const payload = { email: 'e2e+1@example.com', password: 'password' };
      const res = await request(app.getHttpServer()).post('/auth/login').send(payload).expect(201);
      expect(res.body.data).toHaveProperty('access_token');
      expect(res.body.data).toHaveProperty('refresh_token');
    });
  });

  describe('refresh & logout flow', () => {
    it('should refresh tokens and logout', async () => {
      const login = { email: 'e2e+1@example.com', password: 'password' };
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send(login)
        .expect(201);
      const { refresh_token } = loginRes.body.data;

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: refresh_token })
        .expect(201);
      expect(refreshRes.body.data).toHaveProperty('access_token');
      expect(refreshRes.body.data).toHaveProperty('refresh_token');

      const accessToken = refreshRes.body.data.access_token;
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
    });
  });
});
