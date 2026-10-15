// UNIT TESTS - JWT login-token helpers
const jwt = require('jsonwebtoken');
const { generateAccessToken, verifyAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../../src/utils/jwt');

describe('JWT helpers', () => {
  test('UT-BE-11 access token carries the user id and role', () => {
    const token = generateAccessToken('abc123', 'caregiver');
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('abc123');
    expect(decoded.role).toBe('caregiver');
  });

  test('UT-BE-12 a tampered token is rejected', () => {
    const token = generateAccessToken('abc123', 'caregiver');
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });

  test('UT-BE-13 a token signed with a different secret is rejected', () => {
    const fake = jwt.sign({ userId: 'abc123', role: 'caregiver' }, 'some-other-secret');
    expect(() => verifyAccessToken(fake)).toThrow(/invalid signature/);
  });

  test('UT-BE-14 an expired token is rejected', () => {
    const expired = jwt.sign({ userId: 'abc123' }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect(() => verifyAccessToken(expired)).toThrow(/expired/);
  });

  test('UT-BE-15 refresh token round-trips with its own secret', () => {
    const token = generateRefreshToken('abc123');
    expect(verifyRefreshToken(token).userId).toBe('abc123');
    expect(() => verifyAccessToken(token)).toThrow(); // refresh token is not valid as an access token
  });
});
