import sharedConfig from './jest.config.js';

export default {
  ...sharedConfig,
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.e2e-spec.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.ts'],
};
