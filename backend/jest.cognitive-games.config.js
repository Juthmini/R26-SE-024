// Jest settings for the Cognitive Stimulation (brain games) BACKEND tests.
//   npm run test:games              -> everything
//   npm run test:games:unit         -> pure logic, no database
//   npm run test:games:integration  -> real routes + in-memory MongoDB
const reporters = ['default'];
try {
  require.resolve('jest-html-reporter');
  reporters.push([
    'jest-html-reporter',
    {
      pageTitle: 'MemoCare Cognitive Stimulation - Backend Test Report',
      outputPath: 'test-reports/cognitive-games-backend-report.html',
      includeFailureMsg: true,
      sort: 'status',
    },
  ]);
} catch (e) {
  /* reporter not installed - console output only */
}

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/cognitive-games'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/tests/cognitive-games/setup/env.js'],
  testTimeout: 60000, // first run downloads the in-memory MongoDB binary
  verbose: true,
  collectCoverageFrom: [
    'src/services/cognitive/games/difficultyEngine.js',
    'src/services/cognitive/games/contentRotation.js',
    'src/services/cognitive/games/gameContentUtils.js',
    'src/services/cognitive/games/gameValidationService.js',
    'src/services/cognitive/games/gameProgressService.js',
    'src/services/cognitive/games/gameSessionService.js',
    'src/controllers/cognitive/gameSessionController.js',
    'src/controllers/cognitive/gameContentController.js',
  ],
  coverageDirectory: 'test-reports/cognitive-games-coverage',
  reporters,
};
