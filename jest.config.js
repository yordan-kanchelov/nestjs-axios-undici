module.exports = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Unit tests live next to the code in src/**/__tests__, e2e tests in tests/
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(t|j)s$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**'],
  testEnvironment: 'node',
  forceExit: true,
  testTimeout: 10000,
};
