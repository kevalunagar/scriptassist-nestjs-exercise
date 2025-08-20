import { Logger } from '@nestjs/common';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import { Wait } from 'testcontainers';

let container: StartedPostgreSqlContainer;
const logger = new Logger('db-setup.ts');

export const dbSetup = async () => {
  logger.log('Starting Test DB container!!!');

  container = await new PostgreSqlContainer('postgres:15')
    .withName(`postgres-test-db-${crypto.randomUUID()}`)
    .withWaitStrategy(
      Wait.forAll([Wait.forLogMessage('database system is ready to accept connections')]),
    )
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const username = container.getUsername();
  const password = container.getPassword();
  const database = container.getDatabase();

  logger.log(
    `Test DB container created!!! Host: ${host}, Port: ${port}, Username: ${username}, Password: ${password}, Database: ${database}`,
  );

  try {
    logger.log(`Test DB container started at ${host}:${port}!`);

    const env = {
      ...process.env,
      DB_HOST: host,
      DB_PORT: port.toString(),
      DB_USERNAME: username,
      DB_PASSWORD: password,
      DB_DATABASE: database,
    };

    const commandOutput = execSync(`npm run migration:run`, { env });
    logger.debug(
      `===command output start===
      ${commandOutput.toString()}
      ===command output end===`,
    );

    execSync(`pnpm orm:sync`, { env });
    logger.log('Database migration completed!!');

    return {
      host,
      port,
      username,
      password,
      database,
    };
  } catch (e) {
    logger.error(e);
    logger.error(`Test DB container Stopped Due to ${e}!!!`);
    await container?.stop();
    throw e;
  }
};

export const dbStop = async () => {
  await container?.stop();
  logger.log('Test DB container Stopped!!!');
};
