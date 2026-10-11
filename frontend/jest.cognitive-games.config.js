// Jest settings for the Cognitive Stimulation (brain games) FRONTEND tests.
//   npm run test:games             -> all game component tests
const reporters = ['default'];
try {
  require.resolve('jest-html-reporter');
  reporters.push([
    'jest-html-reporter',
    {
      pageTitle: 'MemoCare Cognitive Stimulation - Frontend Test Report',
      outputPath: 'test-reports/cognitive-games-frontend-report.html',
      includeFailureMsg: true,
      sort: 'status',
    },
  ]);
} catch (e) {
  /* reporter not installed - console output only */
}

module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests/cognitive-games'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/cognitive-games/setup/jest.setup.ts'],
  moduleNameMapper: {
    '^@expo/vector-icons$': '<rootDir>/tests/cognitive-games/setup/vectorIconsMock.js',
    '^react-native-reanimated$': '<rootDir>/tests/cognitive-games/setup/reanimatedMock.js',
    '^react-native-svg$': '<rootDir>/tests/cognitive-games/setup/svgMock.js',
    '^react-native-confetti-cannon$': '<rootDir>/tests/cognitive-games/setup/confettiMock.js',
    '^@/(.*)$':'<rootDir>/$1', // makes "@/src/..." imports work
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|nativewind|react-native-css-interop|react-native-svg))',
  ],
  verbose: true,
  collectCoverageFrom: [
    'src/components/patient/cognitive/components/games/DifficultyBadge.tsx',
    'src/components/patient/cognitive/components/games/shared/DifficultyChangeBanner.tsx',
    'src/components/patient/cognitive/components/games/shared/GameHeader.tsx',
    'src/components/patient/cognitive/components/games/shared/InstructionScreen.tsx',
    'src/components/patient/cognitive/components/games/shared/GameResultScreen.tsx',
  ],
  coverageDirectory: 'test-reports/cognitive-games-coverage',
  reporters,
};
