const User = require('../../../src/models/auth/User');
const { generateAccessToken } = require('../../../src/utils/jwt');

let counter = 0;
const uniq = () => `${Date.now()}-${++counter}`;

// Creates a real user in the test DB and a valid login token for them.
const createUser = async (role = 'caregiver', overrides = {}) => {
  const user = await User.create({
    fullName: overrides.fullName || `Test ${role} ${uniq()}`,
    email: overrides.email || `${role}-${uniq()}@test.com`,
    password: 'Password123',
    role,
    isActive: true,
    ...overrides,
  });
  const token = generateAccessToken(user._id, user.role);
  return { user, token };
};

const patientBody = (overrides = {}) => ({
  name: 'Mary Perera', initials: 'MP', age: 78,
  condition: 'Moderate', stage: 'Stage 4', ...overrides,
});

const taskBody = (overrides = {}) => ({
  title: 'Give morning medicine', patientName: 'Mary Perera', patientInitials: 'MP',
  time: '8:00 AM', date: '2099-01-01', ...overrides,
});

const checkInBody = (caregiverId, overrides = {}) => ({
  caregiverId: String(caregiverId),
  sleepHours: 4, physicalTiredness: 5, mood: 1, emotionalOverwhelm: 5,
  hoursCaregiving: 14, tasksAssigned: 15, tasksCompleted: 4,
  difficultSituations: 5, breaksTaken: 0, mentallyExhausted: 5,
  difficultyManaging: 5, emotionallyDrained: 5, ...overrides,
});

module.exports = { createUser, patientBody, taskBody, checkInBody };
