// Runs BEFORE every test file. Fake values so tests never touch your real .env.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest-only';
