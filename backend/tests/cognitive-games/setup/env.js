// Runs BEFORE every test file. Fake values so tests never touch the real .env
// and never call the real LLM / image services.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest-only';
delete process.env.GROQ_API_KEY;
delete process.env.FAL_KEY;
