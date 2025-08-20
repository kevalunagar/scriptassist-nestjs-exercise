import { Logger } from '@nestjs/common';
import { dbSetup, dbStop } from './support/db-setup';

const logger = new Logger('jest-setup');

beforeAll(async () => {
  logger.log('Starting test DB...');
  const dbEnv = await dbSetup();

  process.env.DB_HOST = dbEnv.host;
  process.env.DB_PORT = dbEnv.port.toString();
  process.env.DB_USERNAME = dbEnv.username;
  process.env.DB_PASSWORD = dbEnv.password;
  process.env.DB_DATABASE = dbEnv.database;

  logger.log(`Test DB ready at ${process.env.DB_HOST}:${process.env.DB_PORT}`);
}, 60_000);

afterAll(async () => {
  logger.log('Stopping test DB...');
  await dbStop();
});
