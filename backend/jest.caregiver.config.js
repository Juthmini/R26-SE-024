// Jest settings for the MemoCare BACKEND tests.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/caregiver'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/tests/caregiver/setup/env.js'],   // fake secrets for tests only
  testTimeout: 30000,
  verbose: true,                                   // prints every test name + PASS/FAIL
  collectCoverageFrom: [
    'src/utils/burnoutCalculator.js',
    'src/utils/jwt.js',
    'src/services/caregiver/llmService.js',
    'src/middleware/auth.js',
    'src/controllers/caregiver/*.js',
    'src/controllers/auth/authController.js',
    'src/routes/caregiver/*.js',
    '!src/**/*.test.js',
  ],
  coverageDirectory: 'test-reports/coverage',
  reporters: [
    'default',
    ['jest-html-reporter', {
      pageTitle: 'MemoCare Caregiver Portal - Backend Test Report',
      outputPath: 'test-reports/backend-test-report.html',
      includeFailureMsg: true,
      includeConsoleLog: false,
      sort: 'status',
    }],
  ],
};
