module.exports = {
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(t|j)s$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  // benchmarks/ is a separate npm project (see benchmarks/README.md)
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/benchmarks/'],
  modulePathIgnorePatterns: ['<rootDir>/benchmarks/'],
  forceExit: true,
  testTimeout: 10000,
};
