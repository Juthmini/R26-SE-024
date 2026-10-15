const mongoose = require('mongoose');
const User = require('../../../src/models/auth/User');
const { generateAccessToken } = require('../../../src/utils/jwt');

let counter = 0;
const uniq = () => `${Date.now()}-${++counter}`;

// Creates a real user in the test DB and a valid login token for them.
const createUser = async (role = 'patient', overrides = {}) => {
  const user = await User.create({
    fullName: `Test ${role} ${uniq()}`,
    email: `${role}-${uniq()}@test.com`,
    password: 'Password123',
    role,
    isActive: true,
    ...overrides,
  });
  return { user, token: generateAccessToken(user._id, user.role) };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// A valid body for POST /sessions. Defaults to a strong (~90%) game.
const sessionBody = (patientId, overrides = {}) => ({
  gameId: 'memory_recall',
  patientId: String(patientId),
  difficulty: 'medium',
  score: 9,
  maxScore: 10,
  timeTaken: 20,
  correctAnswers: 9,
  totalAnswers: 10,
  completedAt: new Date().toISOString(),
  ...overrides,
});

const strongGame = { score: 10, maxScore: 10, correctAnswers: 10, totalAnswers: 10 };
const weakGame = { score: 1, maxScore: 10, correctAnswers: 1, totalAnswers: 10 };

const newId = () => new mongoose.Types.ObjectId().toString();

module.exports = { createUser, auth, sessionBody, strongGame, weakGame, newId };
