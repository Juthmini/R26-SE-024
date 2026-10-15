const mongoose = require('mongoose');

// By default a temporary in-memory MongoDB is used (mongodb-memory-server).
// Your real Atlas database is NEVER touched by tests.
// (Advanced: set TEST_MONGO_URI to use some other throw-away database.)
let mongoServer;

const connectTestDB = async () => {
  if (process.env.TEST_MONGO_URI) {
    await mongoose.connect(`${process.env.TEST_MONGO_URI}${Date.now()}${Math.floor(Math.random() * 1e6)}`);
    return;
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
};

const closeTestDB = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) await mongoServer.stop();
};

const clearTestDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) await collections[key].deleteMany({});
};

module.exports = { connectTestDB, closeTestDB, clearTestDB };
