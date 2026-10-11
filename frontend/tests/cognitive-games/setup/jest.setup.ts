// Global mocks for the brain-game component tests.
// Native modules (speech, haptics, SVG, confetti, router) do not exist in Jest,
// so each is replaced by a tiny stand-in the tests can spy on.

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };
  return { useRouter: () => router, __router: router };
});

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

beforeEach(() => {
  const { __router } = require('expo-router');
  Object.values(__router).forEach((fn: any) => fn.mockClear());
  const Speech = require('expo-speech');
  Speech.speak.mockClear();
  Speech.stop.mockClear();
});
